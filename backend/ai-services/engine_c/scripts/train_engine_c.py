import json
import logging
import numpy as np
import polars as pl
import optuna
import joblib
from pathlib import Path
from sklearn.metrics import roc_auc_score

# ONNX Imports for Step 2.4.1
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType

# Phase 1 Imports
from models.statistical_baseline import RobustStatisticalBaseline
from models.seasonal_baseline import SeasonalBaseline

# Phase 2 Imports
from features.pipeline import engineer_multivariate_features, normalize_features
from models.multivariate_ensemble import IsolationForestDetector, PyODEnsembleDetector

# Configure structured logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

ARTIFACTS_DIR = Path("artifacts")
ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

def validate_data_quality(df: pl.DataFrame) -> pl.DataFrame:
    """
    Step 1.1.2: Duplicate and systematic-missingness detection.
    """
    logger.info("Starting offline data quality validation...")
    
    # 1. Duplicate Detection
    duplicates = df.filter(pl.struct(["feeder_id", "timestamp"]).is_duplicated())
    if duplicates.height > 0:
        logger.warning(f"Found {duplicates.height} duplicate pairs. Resolving by keeping first occurrence.")
        df = df.unique(subset=["feeder_id", "timestamp"], maintain_order=True)
    else:
        logger.info("No duplicate timestamp pairs detected.")
    
    # 2. Systematic Missingness Detection
    df = df.with_columns(pl.col("timestamp").dt.cast_time_unit("us"))
    
    telemetry_cols = ["voltage", "load", "frequency", "availability"]
    missingness_df = df.select(
        pl.col("timestamp").dt.hour().alias("hour"),
        *[pl.col(c).is_null().alias(f"{c}_is_null") for c in telemetry_cols]
    )
    
    hourly_missing = missingness_df.group_by("hour").agg(
        *[pl.col(f"{c}_is_null").mean().alias(f"{c}_null_ratio") for c in telemetry_cols]
    ).sort("hour")
    
    threshold = 0.20
    systematic_flags = hourly_missing.filter(
        pl.any_horizontal(pl.col(f"{c}_null_ratio") > threshold for c in telemetry_cols)
    )
    
    if systematic_flags.height > 0:
        logger.warning(f"Systematic missingness detected:\n{systematic_flags}")
    else:
        logger.info("Missingness appears random; no systematic hourly clustering detected.")

    return df

def run_synthetic_validation(df: pl.DataFrame, stat_model: RobustStatisticalBaseline, seas_model: SeasonalBaseline, features: list[str]) -> float:
    """
    Step 1.5: Baseline Validation. 
    Modified to return the maximum observed clean FPR to feed the Isolation Forest contamination rate.
    """
    logger.info("Executing Step 1.5: Validation Against Synthetic Anomalies...")
    
    scored_clean = stat_model.score(df, features)
    scored_clean = seas_model.score(scored_clean, features)
    
    max_fpr = 0.0
    for feature in features:
        stat_fpr = scored_clean.get_column(f"{feature}_is_anomaly").mean()
        seas_fpr = scored_clean.get_column(f"{feature}_is_seasonal_anomaly").mean()
        max_fpr = max(max_fpr, stat_fpr, seas_fpr)
        logger.info(f"{feature} Clean FPR -> Stat Layer: {stat_fpr:.4f}, Seas Layer: {seas_fpr:.4f}")

    df_synthetic = df.clone()
    spike_idx = len(df_synthetic) // 2
    baseline_val = df_synthetic["voltage"][spike_idx]
    
    df_synthetic = df_synthetic.with_columns(
        pl.when(pl.arange(0, pl.len()) == spike_idx)
        .then(baseline_val * 3.0)
        .otherwise(pl.col("voltage"))
        .alias("voltage")
    )
    
    scored_syn = stat_model.score(df_synthetic, features)
    scored_syn = seas_model.score(scored_syn, features)
    
    stat_flag = scored_syn.get_column("voltage_is_anomaly")[spike_idx]
    seas_flag = scored_syn.get_column("voltage_is_seasonal_anomaly")[spike_idx]
    
    logger.info(f"Synthetic Spike Detected -> Stat Layer: {stat_flag}, Seas Layer: {seas_flag}")
    
    # Return a conservative contamination floor (e.g., at least 1%, bounded by observed FPR)
    return max(0.01, min(max_fpr, 0.10))

def train_isolation_forest(df: pl.DataFrame, contamination_rate: float):
    """
    Steps 2.1 & 2.2: Multivariate Feature Engineering and Isolation Forest Training via Optuna.
    Modified to return df_multi so PyOD can use the same engineered features.
    """
    logger.info("Executing Step 2.1: Multivariate Feature Engineering...")
    df_multi = engineer_multivariate_features(df, window_size=6)
    
    multi_features = [
        "voltage_load_ratio", "freq_load_ratio", 
        "voltage_rolling_std", "load_rolling_std", "frequency_rolling_std"
    ]
    df_multi = normalize_features(df_multi, multi_features)
    scaled_cols = [f"{f}_scaled" for f in multi_features]
    
    logger.info(f"Executing Step 2.2: Optuna Hyperparameter Tuning (Contamination: {contamination_rate:.4f})...")
    
    df_eval = df_multi.clone()
    n_samples = len(df_eval)
    y_true = np.zeros(n_samples)
    
    anomaly_indices = np.random.choice(n_samples, size=int(n_samples * 0.05), replace=False)
    y_true[anomaly_indices] = 1
    
    eval_matrix = df_eval.select(scaled_cols).to_numpy()
    eval_matrix[anomaly_indices, 0] -= 3.0  
    
    optuna.logging.set_verbosity(optuna.logging.WARNING)

    def objective(trial):
        n_estimators = trial.suggest_int("n_estimators", 50, 200)
        max_samples = trial.suggest_float("max_samples", 0.1, 1.0)
        
        model = IsolationForestDetector(
            n_estimators=n_estimators, 
            max_samples=max_samples, 
            contamination=contamination_rate,
            random_state=42
        )
        
        model.features = scaled_cols
        model.model.fit(df_multi.select(scaled_cols).to_numpy())
        
        preds = model.model.decision_function(eval_matrix)
        roc_auc = roc_auc_score(y_true, -preds)
        return roc_auc

    study = optuna.create_study(direction="maximize")
    study.optimize(objective, n_trials=10)
    
    best_params = study.best_params
    logger.info(f"Optuna Best Params: {best_params} | Best ROC-AUC: {study.best_value:.4f}")
    
    final_model = IsolationForestDetector(
        n_estimators=best_params["n_estimators"],
        max_samples=best_params["max_samples"],
        contamination=contamination_rate,
        random_state=42
    )
    final_model.fit(df_multi, scaled_cols)
    
    # Return the engineered dataframe and columns so PyOD can reuse them
    return final_model, df_multi, scaled_cols

def train_pyod_ensemble(df_multi: pl.DataFrame, scaled_cols: list[str], contamination_rate: float) -> PyODEnsembleDetector:
    """
    Step 2.3: PyOD Ensemble Training (ECOD + COPOD).
    Uses the pre-engineered features from Step 2.1.
    """
    logger.info("Executing Step 2.3: PyOD Ensemble Training (ECOD + COPOD)...")
    pyod_model = PyODEnsembleDetector(contamination=contamination_rate)
    pyod_model.fit(df_multi, scaled_cols)
    return pyod_model

def main():
    logger.info("Initializing Phase 1 & 2 pipeline execution...")
    
    np.random.seed(42)
    dates = pl.datetime_range(
        start=pl.datetime(2023, 1, 1), 
        end=pl.datetime(2023, 1, 30), 
        interval="1h", 
        eager=True
    )
    df_raw = pl.DataFrame({
        "feeder_id": ["F1"] * len(dates),
        "timestamp": dates,
        "voltage": np.random.normal(230, 5, len(dates)),
        "load": np.random.normal(100, 15, len(dates)),
        "frequency": np.random.normal(50, 0.1, len(dates)),
        "availability": np.ones(len(dates))
    })
    
    df_clean = validate_data_quality(df_raw)
    features = ["voltage", "load", "frequency"]
    
    logger.info("Fitting Layer 1: Robust Statistical Baseline...")
    stat_model = RobustStatisticalBaseline(threshold=3.5)
    stat_model.fit(df_clean, features)
    
    logger.info("Fitting Layer 2: Seasonal Baseline...")
    seas_model = SeasonalBaseline(period=24)
    seas_model.fit(df_clean, features)
    
    empirical_contamination = run_synthetic_validation(df_clean, stat_model, seas_model, features)
    
    # Execute Phase 2 ML Training (Isolation Forest)
    iforest_model, df_multi, scaled_cols = train_isolation_forest(df_clean, empirical_contamination)
    
    # Execute Phase 2 ML Training (PyOD Ensemble)
    pyod_model = train_pyod_ensemble(df_multi, scaled_cols, empirical_contamination)
    
    logger.info("Executing Step 1.4 & 2.4: Artifact Serialization...")
    
    metadata = {
        "version": "1.0",
        "training_records": len(df_clean),
        "statistical_layer": stat_model.get_metadata(),
        "iforest_layer": iforest_model.get_params()
    }
    
    with open(ARTIFACTS_DIR / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=4)
        
    with open(ARTIFACTS_DIR / "seasonal_baselines.json", "w") as f:
        json.dump(seas_model.get_profiles_for_serialization(), f, indent=4)
        
    # Step 2.4.1: Compile Isolation Forest to ONNX
    logger.info("Compiling Isolation Forest to ONNX (Step 2.4.1)...")
    num_features = len(scaled_cols)
    initial_type = [('float_input', FloatTensorType([None, num_features]))]
    
    # ======== THE FIX IS APPLIED HERE ========
    onx = convert_sklearn(
        iforest_model.model, 
        initial_types=initial_type, 
        target_opset={'ai.onnx.ml': 3}
    )
    # =========================================
    
    with open(ARTIFACTS_DIR / "isolation_forest.onnx", "wb") as f:
        f.write(onx.SerializeToString())
        
    # Step 2.4.2: Serialize the PyOD ensemble using joblib
    logger.info("Serializing PyOD Ensemble (Step 2.4.2)...")
    joblib.dump(pyod_model.get_models_for_export(), ARTIFACTS_DIR / "pyod_ensemble.joblib")
        
    logger.info("Phase 1 & 2 execution complete. Models trained and artifacts successfully serialized.")

if __name__ == "__main__":
    main()