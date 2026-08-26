import json
import logging
import numpy as np
import polars as pl
from pathlib import Path

# These imports assume you have placed the previously generated classes 
# in models/statistical_baseline.py and models/seasonal_baseline.py
from models.statistical_baseline import RobustStatisticalBaseline
from models.seasonal_baseline import SeasonalBaseline

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
    # Safe casting to microseconds to prevent NumPy datetime64 resolution errors
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

def run_synthetic_validation(df: pl.DataFrame, stat_model: RobustStatisticalBaseline, seas_model: SeasonalBaseline, features: list[str]):
    """
    Step 1.5: Baseline Validation Against Synthetic Anomalies.
    """
    logger.info("Executing Step 1.5: Validation Against Synthetic Anomalies...")
    
    # 1.5.2: False-positive rate measurement on clean data
    scored_clean = stat_model.score(df, features)
    scored_clean = seas_model.score(scored_clean, features)
    
    for feature in features:
        stat_fpr = scored_clean.get_column(f"{feature}_is_anomaly").mean()
        seas_fpr = scored_clean.get_column(f"{feature}_is_seasonal_anomaly").mean()
        logger.info(f"{feature} Clean FPR -> Stat Layer: {stat_fpr:.4f}, Seas Layer: {seas_fpr:.4f}")

    # 1.5.1: Synthetic anomaly injection testing
    df_synthetic = df.clone()
    spike_idx = len(df_synthetic) // 2
    baseline_val = df_synthetic["voltage"][spike_idx]
    
    # Inject a 300% single-feature spike
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

def main():
    logger.info("Initializing Phase 1 pipeline execution...")
    
    # Generate an eager synthetic DataFrame mimicking the Step 1.1.1 schema for local testing
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
    
    # Fit Detection Layer 1
    logger.info("Fitting Layer 1: Robust Statistical Baseline...")
    stat_model = RobustStatisticalBaseline(threshold=3.5)
    stat_model.fit(df_clean, features)
    
    # Fit Detection Layer 2
    logger.info("Fitting Layer 2: Seasonal Baseline...")
    seas_model = SeasonalBaseline(period=24)
    seas_model.fit(df_clean, features)
    
    run_synthetic_validation(df_clean, stat_model, seas_model, features)
    
    # Step 1.4: Baseline Artifact Serialization
    logger.info("Executing Step 1.4: Baseline Artifact Serialization...")
    
    metadata = {
        "version": "1.0",
        "training_records": len(df_clean),
        "statistical_layer": stat_model.get_metadata()
    }
    
    with open(ARTIFACTS_DIR / "model_metadata.json", "w") as f:
        json.dump(metadata, f, indent=4)
        
    with open(ARTIFACTS_DIR / "seasonal_baselines.json", "w") as f:
        json.dump(seas_model.get_profiles_for_serialization(), f, indent=4)
        
    logger.info("Phase 1 execution complete. Artifacts successfully serialized.")

if __name__ == "__main__":
    main()