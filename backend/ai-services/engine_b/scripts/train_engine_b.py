import os
import json
import numpy as np
import polars as pl
import lightgbm as lgb
import optuna
from onnxmltools import convert_lightgbm
from onnxmltools.convert.common.data_types import FloatTensorType

# Define strict paths based on our directory specification
ARTIFACTS_DIR = os.path.join(os.path.dirname(__file__), "..", "artifacts")
os.makedirs(ARTIFACTS_DIR, exist_ok=True)

class OfflineTrainingPipeline:
    def __init__(self):
        self.horizon_hours = 6
        
    def _generate_synthetic_baseline(self) -> pl.DataFrame:
        """Generates mock telemetry data to test the pipeline without a DB connection."""
        print("[INFO] Generating synthetic baseline data...")
        num_records = 10000
        
        # Create a timeseries index
        # NOTE: np.datetime64("2026-01-01T00:00:00") infers 's' (seconds) resolution,
        # which Polars cannot ingest directly. Polars only supports 'D', 'ms', 'us', 'ns'.
        # We explicitly cast to 'us' (microseconds) to fix this.
        start_time = np.datetime64("2026-01-01T00:00:00", "us")
        times = (start_time + np.arange(num_records) * np.timedelta64(1, 'h')).astype("datetime64[us]")
        
        df = pl.DataFrame({
            "timestamp": times,
            "voltage": np.random.normal(220, 15, num_records),
            "load": np.random.normal(50, 10, num_records),
            "fault_count_recent": np.random.poisson(0.1, num_records)
        })
        return df

    def feature_assembly(self, df: pl.DataFrame) -> pl.DataFrame:
        """Step 1.1 - Feature Assembly: Vectorized rolling windows and temporal encoding."""
        print("[INFO] Executing Polars feature vectorization...")
        
        df = df.with_columns([
            # Cyclical Temporal Encodings
            (pl.col("timestamp").dt.hour() * (2 * np.pi / 24)).sin().alias("hour_sin"),
            (pl.col("timestamp").dt.hour() * (2 * np.pi / 24)).cos().alias("hour_cos"),
            
            # Rolling Statistical Windows (e.g., 24-hour load volatility)
            pl.col("load").rolling_std(window_size=24).fill_null(0).alias("load_volatility_24h"),
            pl.col("voltage").rolling_mean(window_size=12).fill_null(220).alias("voltage_mean_12h")
        ])
        return df

    def target_definition(self, df: pl.DataFrame) -> pl.DataFrame:
        """Step 1.2 - Target Definition: Forward-looking anomaly/outage horizon scan."""
        print(f"[INFO] Defining {self.horizon_hours}-hour forward-looking target...")
        
        # Synthetic target logic: If recent faults > 0 and voltage dips heavily, mark as future outage risk (1)
        df = df.with_columns(
            pl.when((pl.col("fault_count_recent") > 0) & (pl.col("voltage") < 200))
            .then(1)
            .otherwise(0)
            .alias("target_outage_risk")
        )
        
        # Shift target backwards to train the model to predict it 6 hours in advance
        df = df.with_columns(
            pl.col("target_outage_risk").shift(-self.horizon_hours).fill_null(0).alias("target")
        )
        return df.drop(["timestamp", "target_outage_risk"]) # Drop non-features

    def optimize_and_compile(self, df: pl.DataFrame):
        """Step 1.3 - Model Optimization & ONNX Compilation."""
        print("[INFO] Starting model optimization and compilation...")
        
        # Separate features and target
        X = df.drop("target").to_numpy()
        y = df.select("target").to_numpy().ravel()
        feature_names = df.drop("target").columns
        
        # A simple Optuna objective for hyperparameter tuning
        def objective(trial):
            params = {
                "objective": "binary",
                "metric": "auc",
                "verbosity": -1,
                "learning_rate": trial.suggest_float("learning_rate", 0.01, 0.1),
                "num_leaves": trial.suggest_int("num_leaves", 20, 60),
                "max_depth": trial.suggest_int("max_depth", 3, 8),
            }
            dtrain = lgb.Dataset(X, label=y)
            # Use lightgbm.cv instead of lightgbm.train for internal validation
            cv_results = lgb.cv(params, dtrain, nfold=3, num_boost_round=50)
            return cv_results["valid auc-mean"][-1]
            
        study = optuna.create_study(direction="maximize")
        study.optimize(objective, n_trials=5) # Kept low for quick testing
        
        print("[INFO] Training champion model with optimal parameters...")
        champion_params = study.best_params
        champion_params.update({"objective": "binary", "metric": "auc"})
        
        dtrain = lgb.Dataset(X, label=y)
        model = lgb.train(champion_params, dtrain, num_boost_round=100)
        
        # Save native LightGBM booster for SHAP (TreeExplainer cannot read ONNX graphs directly)
        booster_path = os.path.join(ARTIFACTS_DIR, "champion_model.txt")
        model.save_model(booster_path)
        print(f"[INFO] Native booster saved for SHAP explainability: {booster_path}")
        
        # ONNX Compilation
        print("[INFO] Compiling model to ONNX binary...")
        initial_types = [('float_input', FloatTensorType([None, X.shape[1]]))]
        onnx_model = convert_lightgbm(model, initial_types=initial_types, target_opset=12)
        
        # Export Artifacts
        onnx_path = os.path.join(ARTIFACTS_DIR, "risk_model.onnx")
        with open(onnx_path, "wb") as f:
            f.write(onnx_model.SerializeToString())
            
        metadata = {
            "version": "1.0.0",
            "horizon_hours": self.horizon_hours,
            "feature_order": feature_names
        }
        with open(os.path.join(ARTIFACTS_DIR, "model_metadata.json"), "w") as f:
            json.dump(metadata, f, indent=4)
            
        print(f"[SUCCESS] Artifacts exported to: {ARTIFACTS_DIR}")

if __name__ == "__main__":
    pipeline = OfflineTrainingPipeline()
    raw_data = pipeline._generate_synthetic_baseline()
    engineered_data = pipeline.feature_assembly(raw_data)
    training_data = pipeline.target_definition(engineered_data)
    pipeline.optimize_and_compile(training_data)