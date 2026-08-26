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