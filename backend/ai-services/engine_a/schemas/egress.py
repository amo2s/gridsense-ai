from enum import Enum
from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List

class RiskBand(str, Enum):
    """Categorical enumeration of discrete risk bands."""
    STABLE = "STABLE"
    VULNERABLE = "VULNERABLE"
    CRITICAL = "CRITICAL"
    FAILING = "FAILING"

class Trajectory(str, Enum):
    """Categorical enumeration of operational trajectory."""
    IMPROVING = "IMPROVING"
    DETERIORATING = "DETERIORATING"
    STABLE = "STABLE"

class VulnerabilityWindow(BaseModel):
    """Defines isolated intervals where critical thresholds were breached."""
    model_config = ConfigDict(frozen=True) # Enforces immutability for memory efficiency

    start_time: datetime = Field(..., description="Start of the vulnerability window")
    end_time: datetime = Field(..., description="End of the vulnerability window")
    severity_tag: str = Field(..., description="Categorical tag explaining the breach (e.g., 'DURATION_CAP_EXCEEDED')")

class SubScoreMetrics(BaseModel):
    """Exposes raw fractional contributions for explainable telemetry."""
    model_config = ConfigDict(frozen=True)

    base_availability: float = Field(..., ge=0.0, le=1.0, description="Raw uptime ratio")
    duration_penalty: float = Field(..., ge=0.0, le=1.0, description="Applied penalty for outage severity")
    frequency_penalty: float = Field(..., ge=0.0, le=1.0, description="Applied penalty for outage volatility")

class AuditMetadata(BaseModel):
    """Tracks calculation timestamps and strictly tracks the engine version[cite: 1]."""
    model_config = ConfigDict(frozen=True)

    cycle_timestamp: datetime = Field(..., description="The evaluation cycle execution time")
    calculation_latency_ms: float = Field(..., description="Internal processing time in milliseconds")
    engine_version: str = Field(..., description="The semantic version of the scoring engine (e.g., 'v1.0.0')")

class EgressPayload(BaseModel):
    """
    Standardizes output structures, ensuring predictable JSON containing the score, 
    risk band, and vulnerability windows[cite: 1].
    """
    model_config = ConfigDict(frozen=True)

    feeder_id: str = Field(..., description="Unique identifier for the grid asset")
    reliability_score: int = Field(..., ge=0, le=100, description="Deterministic reliability index bounded 0-100")
    risk_band: RiskBand = Field(..., description="Calculated risk band based on the reliability score")
    trajectory: Trajectory = Field(..., description="Trajectory delta compared to the previous cycle")
    sub_scores: SubScoreMetrics = Field(..., description="Decomposed scoring metrics")
    vulnerability_windows: List[VulnerabilityWindow] = Field(
        default_factory=list, 
        description="Array of identified critical vulnerability periods"
    )
    audit: AuditMetadata = Field(..., description="Execution trace and version metadata")