import numpy as np
import polars as pl
from schemas.inference_contracts import PredictionRequest

class FeaturePipeline:
    def __init__(self, metadata: dict):
        """
        Initializes the pipeline with the strict feature ordering defined in the model metadata.
        """
        self.feature_order = metadata.get("feature_order", [])
        
        if not self.feature_order:
            raise ValueError("[FATAL] feature_order missing from model metadata.")

    def vectorize(self, payload: PredictionRequest) -> np.ndarray:
        """
        Transforms the raw Pydantic ingestion payload into a strictly ordered,
        float32 tensor for ONNX inference without memory overhead.
        """
        # Zero-copy ingestion: extract dictionaries and load into Polars
        dicts = [reading.model_dump() for reading in payload.readings]
        df = pl.DataFrame(dicts)

        # Synchronized Vectorization: replicate Step 1.1 training transformations exactly
        df = df.with_columns([
            (pl.col("timestamp").dt.hour() * (2 * np.pi / 24)).sin().alias("hour_sin"),
            (pl.col("timestamp").dt.hour() * (2 * np.pi / 24)).cos().alias("hour_cos"),
            pl.col("load").rolling_std(window_size=24).fill_null(0.0).alias("load_volatility_24h"),
            pl.col("voltage").rolling_mean(window_size=12).fill_null(220.0).alias("voltage_mean_12h")
        ])

        # Extract only the most recent row for the forward-looking prediction
        latest_state = df.tail(1)

        # Deterministic Feature Alignment: force columns into the exact order the ONNX graph expects
        try:
            ordered_state = latest_state.select(self.feature_order)
        except pl.exceptions.ColumnNotFoundError as e:
            raise ValueError(f"Tensor alignment failure. Missing expected feature: {str(e)}")

        # Tensor Egress: convert to a 2D float32 NumPy array
        tensor = ordered_state.to_numpy().astype(np.float32)
        
        return tensor