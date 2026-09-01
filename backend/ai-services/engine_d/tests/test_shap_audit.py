"""
Phase 7.2 - Explainability Audit
Verifies models/hybrid_ranker.py's proxy attribution (_approximate_shap_attributions)
and percentile-based tiering (_determine_tier / _compute_tier_thresholds) against
the real .onnx artifact. This is NOT testing true SHAP/Shapley values - the
production code uses a deterministic per-feature-normalized proxy, not
shap.TreeExplainer or shap.Explainer. Tests are written against that proxy's
actual guarantees, not Shapley-value guarantees it doesn't provide.
"""

import os
import numpy as np
import onnxruntime as ort
import pytest

from schemas.ranking_contracts import MultiEngineSignals, PriorityTier
from models.hybrid_ranker import (
    execute_ranking,
    _approximate_shap_attributions,
    _compute_tier_thresholds,
    _determine_tier,
    FEATURE_NAMES,
    FEATURE_RANGES,
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ONNX_MODEL_PATH = os.path.join(BASE_DIR, "artifacts", "hybrid_ranker.onnx")

ADDITIVITY_TOLERANCE = 1e-6


@pytest.fixture(scope="module")
def onnx_session():
    if not os.path.exists(ONNX_MODEL_PATH):
        pytest.skip(f"artifact not found at {ONNX_MODEL_PATH}")
    return ort.InferenceSession(ONNX_MODEL_PATH)


def _mid_range_row(**overrides):
    values = {
        "reliability_score": 50.0,
        "duration_penalty": 0.5,
        "frequency_penalty": 0.5,
        "risk_score": 50.0,
        "is_anomaly": 0.0,
        "anomaly_confidence": 0.5,
    }
    values.update(overrides)
    return np.array([values[name] for name in FEATURE_NAMES], dtype=np.float32)


# ==========================================
# 1. ADDITIVITY
# ==========================================
# By construction, weights sum to 1.0, so sum(contributions) == score
# exactly (no base_value term - this proxy has none). This is a
# correctness check on the implementation, not a Shapley-value property.

def test_proxy_additivity_holds():
    row = _mid_range_row()
    score = 72.5

    attributions = _approximate_shap_attributions(row, score)
    total = sum(a.contribution for a in attributions)

    assert total == pytest.approx(score, abs=ADDITIVITY_TOLERANCE)


def test_proxy_additivity_holds_for_negative_score():
    """LambdaMART scores are unbounded and can be negative - additivity
    must still hold, not just for positive scores."""
    row = _mid_range_row()
    score = -15.3

    attributions = _approximate_shap_attributions(row, score)
    total = sum(a.contribution for a in attributions)

    assert total == pytest.approx(score, abs=ADDITIVITY_TOLERANCE)


# ==========================================
# 2. FEATURE ALIGNMENT (per-feature normalization correctness)
# ==========================================
# Confirms the fix for the mixed-scale bug: a feature at its own maximum
# should dominate attribution regardless of its raw numeric scale
# (reliability_score maxes at 100, duration_penalty maxes at 1.0).

def test_feature_at_its_max_dominates_low_scale_feature():
    """duration_penalty (range 0-1) at its max should outweigh
    reliability_score (range 0-100) sitting near its own minimum,
    proving normalization is per-feature, not raw-magnitude."""
    row = _mid_range_row(duration_penalty=1.0, reliability_score=1.0, is_anomaly=0.5)
    score = 60.0

    attributions = _approximate_shap_attributions(row, score)
    top = max(attributions, key=lambda a: abs(a.contribution))

    assert top.feature_name == "duration_penalty"


def test_feature_at_its_max_dominates_another_low_scale_feature():
    row = _mid_range_row(anomaly_confidence=1.0, risk_score=1.0, is_anomaly=0.5)
    score = 60.0

    attributions = _approximate_shap_attributions(row, score)
    top = max(attributions, key=lambda a: abs(a.contribution))

    assert top.feature_name == "anomaly_confidence"


def test_all_features_at_neutral_midpoint_distributes_evenly():
    """Degenerate case: every feature sitting exactly at ITS OWN midpoint
    (not at its floor) -> zero deviation for all -> must fall back to even
    distribution, not divide-by-zero or collapse to a single feature."""
    row = np.array([50.0, 0.5, 0.5, 50.0, 0.5, 0.5], dtype=np.float32)
    score = 10.0

    attributions = _approximate_shap_attributions(row, score)
    expected_each = score / len(FEATURE_NAMES)

    for a in attributions:
        assert a.contribution == pytest.approx(expected_each, abs=ADDITIVITY_TOLERANCE)