"""
Phase 4: High-Performance Inference Execution (models/hybrid_ranker.py)
Executes the ONNX inference, computes explanations, and assembles the strict egress contract.
"""

import numpy as np
import onnxruntime as ort
from typing import List
from schemas.ranking_contracts import (
    PrioritizationResponse, 
    RankedAsset, 
    PriorityTier, 
    ShapAttribution
)

# Feature names strictly mapped to the (None, 6) tensor dimensions from Phase 3
FEATURE_NAMES = [
    "reliability_score", 
    "duration_penalty", 
    "frequency_penalty", 
    "risk_score", 
    "is_anomaly", 
    "anomaly_confidence"
]

def _determine_tier(score: float) -> PriorityTier:
    """Maps continuous priority scores to discrete operational tiers."""
    # Note: Thresholds should be calibrated to real operational distributions.
    if score > 80.0:
        return PriorityTier.CRITICAL
    elif score > 60.0:
        return PriorityTier.HIGH
    elif score > 40.0:
        return PriorityTier.MEDIUM
    return PriorityTier.LOW

def _approximate_shap_attributions(tensor_row: np.ndarray, score: float) -> List[ShapAttribution]:
    """
    Calculates feature attributions. 
    Note: For standard ONNX LightGBM exports, native SHAP requires a parallel TreeExplainer.
    This provides a deterministic proxy distribution based on normalized feature inputs for the MVP.
    """
    row_sum = np.sum(tensor_row) if np.sum(tensor_row) > 0 else 1.0
    normalized_weights = tensor_row / row_sum
    
    attributions = []
    for i, name in enumerate(FEATURE_NAMES):
        attributions.append(
            ShapAttribution(
                feature_name=name,
                contribution=float(normalized_weights[i] * score)
            )
        )
    
    # Sort explanations by highest contribution magnitude
    return sorted(attributions, key=lambda x: abs(x.contribution), reverse=True)

def execute_ranking(
    ort_session: ort.InferenceSession, 
    input_tensor: np.ndarray, 
    feeder_ids: List[str],
    query_id: str,
    model_version: str = "v1.0.0-onnx"
) -> PrioritizationResponse:
    """
    Executes sub-millisecond ranking inference and enforces the egress contract.
    """
    # 1. Execute ONNX inference
    onnx_inputs = {ort_session.get_inputs()[0].name: input_tensor}
    raw_scores = ort_session.run(None, onnx_inputs)[0].flatten()
    
    # 2. Assemble pre-ranked assets
    assets = []
    for i, feeder_id in enumerate(feeder_ids):
        score = float(raw_scores[i])
        tier = _determine_tier(score)
        explanations = _approximate_shap_attributions(input_tensor[i], score)
        
        assets.append({
            "feeder_id": feeder_id,
            "raw_score": score,
            "priority_tier": tier,
            "explanations": explanations
        })
        
    # 3. Sort assets descending by raw_score to determine ranking
    assets.sort(key=lambda x: x["raw_score"], reverse=True)
    
    # 4. Assign 1-indexed rank positions and build strict Pydantic models
    ranked_assets = []
    for rank_idx, asset_data in enumerate(assets):
        ranked_assets.append(
            RankedAsset(
                feeder_id=asset_data["feeder_id"],
                rank_position=rank_idx + 1,
                priority_score=asset_data["raw_score"],
                priority_tier=asset_data["priority_tier"],
                explanations=asset_data["explanations"]
            )
        )
        
    # 5. Return the validated egress contract (this triggers the @model_validator sorting check)
    return PrioritizationResponse(
        query_id=query_id,
        model_version=model_version,
        ranked_assets=ranked_assets
    )