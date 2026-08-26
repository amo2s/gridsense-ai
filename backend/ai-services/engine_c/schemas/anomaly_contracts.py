from enum import Enum
from datetime import datetime
from typing import List
from pydantic import BaseModel, Field, ConfigDict, model_validator

# ==========================================
# ENUMS & SUB-CONTRACTS
# ==========================================

class SeverityLevel(str, Enum):
    """
    Deterministic severity classification for downstream alerting and dashboard color-coding.
    """
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"

class AttributionFactor(BaseModel):
    """
    Standardized explanation format for why an anomaly was flagged.
    Powers front-end radar charts and bar plots.
    """
    model_config = ConfigDict(extra="forbid")
    
    feature: str = Field(..., description="Name of the anomalous telemetry feature")
    magnitude: float = Field(..., description="Absolute deviation magnitude or SHAP value")
    source: str = Field(..., description="The detection layer that flagged this factor")

class LayerFlags(BaseModel):
    """
    Audit trail detailing exactly which mathematical layers triggered.
    """
    model_config = ConfigDict(extra="forbid")
    
    layer1_stat: bool = Field(..., description="Statistical MAD anomaly flag")
    layer2_seas: bool = Field(..., description="Seasonal STL anomaly flag")
    layer3_multi: bool = Field(..., description="Multivariate Isolation Forest / PyOD flag")

# ==========================================
# INGRESS (REQUEST) CONTRACTS
# ==========================================

class TelemetryReading(BaseModel):
    """
    Single discrete telemetry reading.
    Omitted `strict=True` to allow Pydantic to automatically coerce ISO-8601 strings to datetime objects.
    """
    model_config = ConfigDict(extra="forbid")
    
    feeder_id: str = Field(..., description="Unique identifier for the grid feeder")
    timestamp: datetime = Field(..., description="UTC ISO-8601 timestamp")
    voltage: float = Field(..., ge=0.0, le=500.0, description="Voltage reading (V)")
    load: float = Field(..., ge=0.0, description="Current load (Amperes or kW)")
    frequency: float = Field(..., ge=0.0, description="Grid frequency (Hz)")
    availability: float = Field(..., ge=0.0, le=1.0, description="System availability (0.0 to 1.0)")

class TelemetryWindowRequest(BaseModel):
    """
    Sliding window of telemetry data required for rolling feature engineering and STL baselining.
    """
    model_config = ConfigDict(extra="forbid")
    
    # Require a minimum of 24 points to ensure seasonal baselines have enough context
    readings: List[TelemetryReading] = Field(
        ..., 
        min_length=24, 
        description="Chronological sliding window of telemetry readings"
    )

    @model_validator(mode='after')
    def enforce_chronological_order(self) -> 'TelemetryWindowRequest':
        """
        Advanced ML Guardrail:
        Strictly enforces that the incoming data window is ordered by time.
        Out-of-order data silently destroys rolling averages and differential features.
        """
        readings = self.readings
        for i in range(1, len(readings)):
            if readings[i].timestamp <= readings[i-1].timestamp:
                raise ValueError(
                    f"Readings must be strictly chronological. "
                    f"Found {readings[i].timestamp} occurring at or before {readings[i-1].timestamp}."
                )
        return self

# ==========================================
# EGRESS (RESPONSE) CONTRACTS
# ==========================================

class AnomalyResponse(BaseModel):
    """
    Strict payload definition sent back to the Go gateway.
    Ensures zero schema drift for downstream consumers.
    """
    model_config = ConfigDict(extra="forbid")
    
    feeder_id: str = Field(..., description="Target feeder identifier")
    timestamp: datetime = Field(..., description="Timestamp of the inference target (latest reading)")
    is_anomaly: bool = Field(..., description="Master aggregate anomaly flag")
    severity: SeverityLevel = Field(..., description="Deterministic severity tier")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Weighted ML confidence (0.0 to 1.0)")
    
    layer_flags: LayerFlags = Field(..., description="Component layer triggers")
    ranked_attributions: List[AttributionFactor] = Field(..., description="Top factors ranked by magnitude")
    reasons: List[str] = Field(..., description="Deterministic, human-readable explanations (No LLM hallucination)")
    
    inference_latency_ms: float = Field(..., ge=0.0, description="SLA tracking: End-to-end inference time")
    model_version: str = Field(..., description="Artifact lineage tag mapped to model_metadata.json")