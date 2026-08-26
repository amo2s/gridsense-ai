from pydantic import BaseModel, Field, ConfigDict, model_validator
from typing import List
from datetime import datetime, timezone

# ==========================================
# STEP 2.1: INGESTION CONTRACTS
# ==========================================

class TelemetryReading(BaseModel):
    """Schema for individual historical telemetry data points."""
    model_config = ConfigDict(extra="forbid")

    timestamp: datetime = Field(..., description="Exact ISO-8601 timestamp of the reading")
    voltage: float = Field(..., ge=0.0, le=500.0, description="Feeder voltage with physical hard boundaries")
    load: float = Field(..., ge=0.0, le=1000.0, description="Load in kW or MW, strictly non-negative")
    fault_count_recent: int = Field(..., ge=0, description="Count of recent faults, strictly non-negative")

class PredictionRequest(BaseModel):
    """
    Contract for the incoming payload from the Go Gateway.
    Requires a chronologically ordered array of telemetry for feature windowing.
    """
    model_config = ConfigDict(extra="forbid")

    feeder_id: str = Field(..., min_length=1, description="Unique identifier for the target feeder")
    readings: List[TelemetryReading] = Field(
        ..., 
        min_length=24, 
        description="Minimum 24 hours of sequential telemetry data for rolling window aggregation"
    )

    @model_validator(mode='after')
    def validate_temporal_integrity(self):
        """
        Custom validator to guarantee timestamps are strictly sequential 
        and contain no future dates, preventing temporal target leakage.
        """
        readings = self.readings
        current_time = datetime.now(timezone.utc)

        for i in range(1, len(readings)):
            if readings[i].timestamp <= readings[i-1].timestamp:
                raise ValueError("Telemetry readings must be in strictly ascending chronological order.")
            
            if readings[i].timestamp > current_time:
                raise ValueError("Telemetry reading contains future timestamps. Temporal leakage detected.")
                
        return self


# ==========================================
# STEP 2.2: EGRESS CONTRACTS
# ==========================================

class ShapFactor(BaseModel):
    """Schema for individual feature contributions to satisfy the XAI mandate."""
    model_config = ConfigDict(extra="forbid")

    feature_name: str = Field(..., description="Name of the engineered feature")
    contribution: float = Field(..., description="SHAP weight indicating impact on the final risk score")

class PredictionResponse(BaseModel):
    """
    Standardized egress contract sent back to the Go Gateway.
    Guarantees predictable JSON structure for downstream DB persistence and Next.js UI rendering.
    """
    model_config = ConfigDict(extra="forbid")

    feeder_id: str = Field(..., description="Identifier of the evaluated feeder")
    generated_at: datetime = Field(..., description="Timestamp of inference execution")
    horizon_hours: int = Field(6, description="Forecast horizon in hours")
    risk_score: float = Field(..., ge=0.0, le=100.0, description="Normalized predictive risk score")
    risk_level: str = Field(..., pattern="^(LOW|MEDIUM|HIGH)$", description="Discrete categorization of risk")
    model_version: str = Field(..., description="Version of the ONNX model used for inference")
    contributing_factors: List[ShapFactor] = Field(
        ..., 
        description="Ordered list of top SHAP values for explainability"
    )