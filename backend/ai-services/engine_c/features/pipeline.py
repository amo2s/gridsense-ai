import polars as pl
import pandera.polars as pa

class TelemetrySchema(pa.DataFrameModel):
    """
    Step 1.1.1: Polars/Pandera DataFrame schema defining strict bounds.
    """
    feeder_id: str = pa.Field(coerce=True)
    timestamp: pl.Datetime = pa.Field()
    voltage: float = pa.Field(ge=0.0, le=500.0, nullable=False)
    load: float = pa.Field(ge=0.0, nullable=False)
    frequency: float = pa.Field(ge=0.0, nullable=False)
    availability: float = pa.Field(ge=0.0, le=1.0, nullable=False)

    class Config:
        strict = True
        coerce = True

def normalize_timestamps(df: pl.DataFrame) -> pl.DataFrame:
    """
    Step 1.1.3: Coerce all incoming timestamps to timezone-aware UTC datetimes.
    """
    # Cast to a consistent time unit and enforce UTC.
    # If the data is already tz-aware, we convert to UTC; if naive, we assume UTC.
    return df.with_columns(
        pl.col("timestamp")
        .dt.cast_time_unit("us")
        .dt.replace_time_zone("UTC")
    )

def ingest_and_validate(df: pl.DataFrame) -> pl.DataFrame:
    """
    Pipeline entry point for Phase 1.1 offline data ingestion.
    """
    df_normalized = normalize_timestamps(df)
    df_validated = TelemetrySchema.validate(df_normalized)
    
    return df_validated

def engineer_multivariate_features(df: pl.DataFrame, window_size: int = 6) -> pl.DataFrame:
    """
    Step 2.1.1: Engineer rolling cross-feature and ratio features.
    Exposes cross-feature interaction patterns for the ML ensemble.
    """
    # Ensure data is sorted temporally per feeder before applying rolling windows
    df = df.sort(["feeder_id", "timestamp"])
    
    # Calculate ratios between linked features (e.g., voltage to load)
    df = df.with_columns([
        (pl.col("voltage") / (pl.col("load") + 1e-6)).alias("voltage_load_ratio"),
        (pl.col("frequency") / (pl.col("load") + 1e-6)).alias("freq_load_ratio")
    ])
    
    # Calculate rolling standard deviations to capture volatility
    rolling_cols = ["voltage", "load", "frequency"]
    df = df.with_columns([
        pl.col(c).rolling_std(window_size=window_size).alias(f"{c}_rolling_std")
        for c in rolling_cols
    ])
    
    # Drop nulls created by the rolling window initialization
    return df.drop_nulls()

def normalize_features(df: pl.DataFrame, feature_cols: list[str]) -> pl.DataFrame:
    """
    Step 2.1.2: Standardize features to zero mean and unit variance.
    Crucial for Isolation Forest and PyOD distance/density computations.
    """
    expressions = []
    for col in feature_cols:
        # (value - mean) / std
        expressions.append(
            ((pl.col(col) - pl.col(col).mean()) / (pl.col(col).std() + 1e-6)).alias(f"{col}_scaled")
        )
    
    return df.with_columns(expressions)