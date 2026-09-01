"""
Phase 4: High-Performance Inference Execution (models/hybrid_ranker.py)
Executes the ONNX inference, computes explanations, and assembles the strict egress contract.
"""

import logging
import numpy as np
import onnxruntime as ort
from typing import List
from schemas.ranking_contracts import (
    PrioritizationResponse,
    RankedAsset,
    PriorityTier,
    ShapAttribution
)

logger = logging.getLogger(__name__)

# Feature names strictly mapped to the (None, 6) tensor dimensions from Phase 3
FEATURE_NAMES = [
    "reliability_score",
    "duration_penalty",
    "frequency_penalty",
    "risk_score",
    "is_anomaly",
    "anomaly_confidence"
]

# Known valid ranges per feature, matching schemas/ranking_contracts.py
# bounds (ge/le). MUST be updated together if either changes.
FEATURE_RANGES = {
    "reliability_score": (0.0, 100.0),
    "duration_penalty": (0.0, 1.0),
    "frequency_penalty": (0.0, 1.0),
    "risk_score": (0.0, 100.0),
    "is_anomaly": (0.0, 1.0),
    "anomaly_confidence": (0.0, 1.0),
}

# Features where a HIGH normalized value is protective (reduces urgency),
# unlike every other feature where high = more urgent. Their deviation
# from the midpoint must be inverted before computing attribution direction.
INVERSE_FEATURES = {"reliability_score"}

# Percentile-based tier boundaries. Raw LambdaMART scores are unbounded and
# model-specific - fixed constants (e.g. ">80") silently misclassify every
# asset if the actual score distribution doesn't match that assumption.
# These are computed per-batch below, over the current ranking group,
# rather than assumed globally.
TIER_PERCENTILES = {
    PriorityTier.CRITICAL: 90,
    PriorityTier.HIGH: 70,
    PriorityTier.MEDIUM: 40,
}


class InferenceError(RuntimeError):
    """Raised when ONNX inference or input validation fails in a way the
    caller (FastAPI route) should translate into a 5xx/4xx response."""


def _validate_inputs(input_tensor: np.ndarray, feeder_ids: List[str]) -> None:
    if input_tensor.ndim != 2 or input_tensor.shape[1] != len(FEATURE_NAMES):
        raise InferenceError(
            f"input_tensor has shape {input_tensor.shape}, expected "
            f"(N, {len(FEATURE_NAMES)})"
        )
    if input_tensor.shape[0] != len(feeder_ids):
        raise InferenceError(
            f"input_tensor row count ({input_tensor.shape[0]}) does not match "
            f"feeder_ids count ({len(feeder_ids)})"
        )
    if not np.isfinite(input_tensor).all():
        raise InferenceError("input_tensor contains NaN or Inf values")


def _compute_tier_thresholds(scores: np.ndarray) -> dict:
    """Derives CRITICAL/HIGH/MEDIUM score cutoffs from this batch's own
    percentile distribution, so tiering adapts to the model's actual
    output range instead of assuming a fixed 0-100 scale."""
    return {
        tier: float(np.percentile(scores, pct))
        for tier, pct in TIER_PERCENTILES.items()
    }


def _determine_tier(score: float, thresholds: dict) -> PriorityTier:
    """Maps a continuous priority score to a discrete operational tier,
    using batch-relative percentile thresholds (see _compute_tier_thresholds)."""
    if score >= thresholds[PriorityTier.CRITICAL]:
        return PriorityTier.CRITICAL
    elif score >= thresholds[PriorityTier.HIGH]:
        return PriorityTier.HIGH
    elif score >= thresholds[PriorityTier.MEDIUM]:
        return PriorityTier.MEDIUM
    return PriorityTier.LOW


def _approximate_shap_attributions(tensor_row: np.ndarray, score: float) -> List[ShapAttribution]:
    """
    Calculates feature attributions using a deterministic proxy.

    Each feature's contribution direction is derived from its own deviation
    from a neutral midpoint (0.5 on the per-feature normalized scale) - NOT
    from the sign of the total score. A feature sitting above its midpoint
    (e.g. high risk_score) contributes toward urgency; a feature that is
    protective when high (reliability_score) has its deviation inverted
    first, so high reliability correctly contributes AWAY from urgency.
    Magnitudes are scaled so attributions sum exactly to the model's total
    score, preserving additivity.

    Note: this is a deterministic proxy, not true Shapley values. For
    production-grade exact attribution, replace with shap.TreeExplainer
    against the LightGBM booster (not the ONNX artifact).
    """
    normalized = np.zeros(len(FEATURE_NAMES), dtype=np.float64)
    for i, name in enumerate(FEATURE_NAMES):
        low, high = FEATURE_RANGES[name]
        span = high - low
        normalized[i] = (tensor_row[i] - low) / span if span > 0 else 0.5

    # reliability_score is protective (inverse relationship to urgency) -
    # invert its normalized value so "high reliability" correctly produces
    # a negative (urgency-reducing) deviation, matching every other
    # feature's convention of "higher normalized value = more urgent."
    directional = normalized.copy()
    for i, name in enumerate(FEATURE_NAMES):
        if name in INVERSE_FEATURES:
            directional[i] = 1.0 - directional[i]

    # Deviation from midpoint (0.5): positive = above midpoint (drives
    # urgency up), negative = below midpoint (drives urgency down).
    deviation = directional - 0.5

    abs_deviation_sum = np.sum(np.abs(deviation))
    if abs_deviation_sum <= 1e-9:
        # All features sitting exactly at their midpoint - no directional
        # signal to distribute. Split the score evenly rather than
        # dividing by zero or defaulting to an arbitrary direction.
        raw_shares = np.full(len(FEATURE_NAMES), 1.0 / len(FEATURE_NAMES))
    else:
        raw_shares = deviation / abs_deviation_sum

    # Scale each feature's signed share by the total score, so that
    # sum(contributions) == score exactly (additivity preserved), while
    # each individual feature's sign reflects its OWN deviation direction.
    contributions = raw_shares * score

    attributions = [
        ShapAttribution(feature_name=name, contribution=float(contributions[i]))
        for i, name in enumerate(FEATURE_NAMES)
    ]

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

    Raises:
        InferenceError: on malformed input or ONNX runtime failure. Callers
        (api/prioritization_routes.py) should catch this and return a 4xx/5xx
        response rather than letting a raw exception propagate.
    """
    _validate_inputs(input_tensor, feeder_ids)

    # 1. Execute ONNX inference
    try:
        onnx_inputs = {ort_session.get_inputs()[0].name: input_tensor}
        raw_scores = ort_session.run(None, onnx_inputs)[0].flatten()
    except Exception as exc:
        logger.error("ONNX inference failed", extra={"query_id": query_id}, exc_info=exc)
        raise InferenceError(f"ONNX inference failed for query_id={query_id}") from exc

    if not np.isfinite(raw_scores).all():
        logger.error(
            "ONNX inference produced non-finite scores",
            extra={"query_id": query_id, "raw_scores": raw_scores.tolist()},
        )
        raise InferenceError(f"Non-finite scores returned for query_id={query_id}")

    # 2. Calibrate tier thresholds against this batch's actual score distribution
    thresholds = _compute_tier_thresholds(raw_scores)

    # 3. Assemble pre-ranked assets
    assets = []
    for i, feeder_id in enumerate(feeder_ids):
        score = float(raw_scores[i])
        tier = _determine_tier(score, thresholds)
        explanations = _approximate_shap_attributions(input_tensor[i], score)

        assets.append({
            "feeder_id": feeder_id,
            "raw_score": score,
            "priority_tier": tier,
            "explanations": explanations
        })

    # 4. Sort assets descending by raw_score to determine ranking
    assets.sort(key=lambda x: x["raw_score"], reverse=True)

    # 5. Assign 1-indexed rank positions and build strict Pydantic models
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

    # 6. Return the validated egress contract (this triggers the @model_validator sorting check)
    return PrioritizationResponse(
        query_id=query_id,
        model_version=model_version,
        ranked_assets=ranked_assets
    )