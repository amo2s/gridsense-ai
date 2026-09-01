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

# Percentile-based tier boundaries. Raw LambdaMART scores are unbounded and
# model-specific - fixed constants (e.g. ">80") silently misclassify every
# asset if the actual score distribution doesn't match that assumption.
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


def _neutral_row() -> np.ndarray:
    """A reference row with every feature at its own midpoint - the
    'no signal either way' baseline input used to measure each feature's
    real marginal effect on the model's output."""
    row = np.zeros(len(FEATURE_NAMES), dtype=np.float32)
    for i, name in enumerate(FEATURE_NAMES):
        low, high = FEATURE_RANGES[name]
        row[i] = (low + high) / 2.0
    return row


def _run_single_row(ort_session: ort.InferenceSession, row: np.ndarray) -> float:
    """Runs the real ONNX model on a single feature row. Used both for the
    baseline and for each one-feature-at-a-time perturbation below."""
    input_name = ort_session.get_inputs()[0].name
    output = ort_session.run(None, {input_name: row.reshape(1, -1).astype(np.float32)})
    return float(output[0].flatten()[0])


def _compute_marginal_attributions(
    ort_session: ort.InferenceSession,
    tensor_row: np.ndarray,
    score: float,
) -> tuple[List[ShapAttribution], float]:
    """
    Computes feature attributions via real one-at-a-time marginal
    perturbation against the live ONNX model - NOT a formula-derived
    proportional split. For each feature, swap in its actual value while
    holding every other feature at the neutral baseline, and measure the
    genuine model score delta. This is what makes the sign trustworthy:
    it reflects actual model behavior, not an assumption about which
    features "should" be protective vs. risky.

    Additivity is guaranteed by construction, not by a formula that can
    divide by zero: base_value absorbs whatever the sum of individual
    marginals doesn't account for (interaction effects between features),
    so sum(contributions) + base_value == score exactly, always.

    Returns:
        (attributions, base_value) - attributions sum with base_value to
        exactly equal `score`.
    """
    baseline = _neutral_row()
    baseline_score = _run_single_row(ort_session, baseline)

    marginals = np.zeros(len(FEATURE_NAMES), dtype=np.float64)
    for i in range(len(FEATURE_NAMES)):
        perturbed = baseline.copy()
        perturbed[i] = tensor_row[i]
        perturbed_score = _run_single_row(ort_session, perturbed)
        marginals[i] = perturbed_score - baseline_score

    # Interaction effects (or a non-additive model) mean sum(marginals)
    # may not exactly equal (score - baseline_score). Fold that residual
    # into base_value so additivity holds exactly, rather than distorting
    # individual feature signs to force a match.
    residual = (score - baseline_score) - float(np.sum(marginals))
    base_value = baseline_score + residual

    attributions = [
        ShapAttribution(feature_name=name, contribution=float(marginals[i]))
        for i, name in enumerate(FEATURE_NAMES)
    ]

    return sorted(attributions, key=lambda x: abs(x.contribution), reverse=True), base_value


def execute_ranking(
    ort_session: ort.InferenceSession,
    input_tensor: np.ndarray,
    feeder_ids: List[str],
    query_id: str,
    model_version: str = "v1.0.0-onnx"
) -> PrioritizationResponse:
    """
    Executes ranking inference and enforces the egress contract.

    Note on latency: explanation computation now runs 7 ONNX inferences per
    asset (1 baseline, shared across the batch, + 6 single-feature
    perturbations per asset) instead of 1. Still sub-millisecond per call
    on CPUExecutionProvider for a model this size, but no longer a single
    inference per request - measure under real load before assuming this
    meets your latency SLA at scale.

    Raises:
        InferenceError: on malformed input or ONNX runtime failure. Callers
        (api/prioritization_routes.py) should catch this and return a 4xx/5xx
        response rather than letting a raw exception propagate.
    """
    _validate_inputs(input_tensor, feeder_ids)

    # 1. Execute ONNX inference for the actual ranking scores
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

        try:
            explanations, base_value = _compute_marginal_attributions(
                ort_session, input_tensor[i], score
            )
        except Exception as exc:
            logger.error(
                "Marginal attribution computation failed",
                extra={"query_id": query_id, "feeder_id": feeder_id},
                exc_info=exc,
            )
            raise InferenceError(
                f"Explanation computation failed for feeder_id={feeder_id}, query_id={query_id}"
            ) from exc

        assets.append({
            "feeder_id": feeder_id,
            "raw_score": score,
            "priority_tier": tier,
            "explanations": explanations,
            "base_value": base_value,
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
                explanations=asset_data["explanations"],
                base_value=asset_data["base_value"],
            )
        )

    # 6. Return the validated egress contract (this triggers the @model_validator sorting check)
    return PrioritizationResponse(
        query_id=query_id,
        model_version=model_version,
        ranked_assets=ranked_assets
    )