"""
Phase 2: Data Contracts for Intelligence Engine D (Intervention Prioritization)
Enforces strict ingress boundary checks for Engine A, B, and C payloads,
and standardizes the egress ranking response for downstream consumers.
"""

from enum import Enum
from datetime import datetime, timezone
from typing import List
from pydantic import BaseModel, Field, ConfigDict, model_validator

# ==========================================
# STEP 2.1: INGRESS (REQUEST) CONTRACTS
# ==========================================

class MultiEngineSignals(BaseModel):
    """
    Strict representation of a single feeder's fused intelligence state.
    Requires outputs from Engine A (Reliability), B (Risk), and C (Anomaly).
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    feeder_id: str = Field(..., min_length=1, description="Unique grid asset identifier")
    
    # Engine A (Reliability) Signals
    reliability_score: float = Field(..., ge=0.0, le=100.0, description="Normalized historical reliability")
    duration_penalty: float = Field(..., ge=0.0, le=1.0, description="Fractional penalty for outage length")
    frequency_penalty: float = Field(..., ge=0.0, le=1.0, description="Fractional penalty for outage recurrence")
    
    # Engine B (Risk) Signals
    risk_score: float = Field(..., ge=0.0, le=100.0, description="Predicted short-term failure risk")
    
    # Engine C (Anomaly) Signals
    is_anomaly: bool = Field(..., description="Binary aggregate anomaly flag")
    anomaly_confidence: float = Field(..., ge=0.0, le=1.0, description="ML confidence in the anomaly detection")

class PrioritizationRequest(BaseModel):
    """
    The incoming payload from the Go Gateway requesting a batch ranking operation.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    query_id: str = Field(..., description="Operational group ID (e.g., region or state block)")
    assets: List[MultiEngineSignals] = Field(
        ..., 
        min_length=2, 
        description="Minimum of 2 assets required to perform listwise ranking"
    )

# ==========================================
# STEP 2.2: EGRESS (RESPONSE) CONTRACTS
# ==========================================

class PriorityTier(str, Enum):
    """Categorical enumeration of intervention urgency."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"

class ShapAttribution(BaseModel):
    """XAI mandate: Standardized format for feature importance on a specific prediction."""
    model_config = ConfigDict(frozen=True, extra="forbid")

    feature_name: str = Field(..., description="Name of the evaluated feature")
    contribution: float = Field(..., description="SHAP marginal contribution to the priority score")

class RankedAsset(BaseModel):
    """
    The output evaluation for a single asset, containing its rank, score, and explanation.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    feeder_id: str = Field(..., description="Target feeder identifier")
    rank_position: int = Field(..., ge=1, description="1-indexed rank within the query group (1 is highest priority)")
    priority_score: float = Field(..., description="Raw output score from the LambdaMART ranker")
    priority_tier: PriorityTier = Field(..., description="Deterministic category mapped from the priority score")
    explanations: List[ShapAttribution] = Field(..., description="Itemized SHAP values driving this specific rank")

class PrioritizationResponse(BaseModel):
    """
    Standardized payload sent back to the Go Gateway for UI rendering and DB persistence.
    """
    model_config = ConfigDict(frozen=True, extra="forbid")

    query_id: str = Field(..., description="The original operational group ID")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc), description="Inference timestamp")
    model_version: str = Field(..., description="Version tag of the ONNX artifact used")
    ranked_assets: List[RankedAsset] = Field(
        ..., 
        description="Chronologically sorted array of assets based on operational urgency"
    )

    @model_validator(mode='after')
    def validate_ranking_order(self) -> 'PrioritizationResponse':
        """
        Post-computation guardrail: Ensures the egress list is strictly sorted 
        by rank_position before leaving the microservice.
        """
        assets = self.ranked_assets
        for i in range(1, len(assets)):
            if assets[i].rank_position < assets[i-1].rank_position:
                raise ValueError("Fatal Egress Error: Ranked assets are not sorted correctly by rank_position.")
        return self