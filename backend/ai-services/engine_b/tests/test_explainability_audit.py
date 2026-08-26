"""
Step 5.3 - Explainability Audit

Verifies that SHAP values produced during inference are not merely present,
but mathematically correct -- satisfying SHAP's core additivity guarantee:

    base_value + sum(shap_values for all features) == raw model margin output

This is the property that actually justifies the XAI mandate ("every alert
explicitly states its underlying cause"). A SHAP integration that returns
plausible-looking numbers which don't actually sum to the model's own
output would be silently wrong -- this test is what catches that class of
bug, which neither test_boundary.py (schema/HTTP contract) nor
test_parity.py (ONNX vs native probability) would ever detect.

Two things are verified:
  1. Additivity: base_value + sum(full SHAP vector) reconstructs the raw
     margin (log-odds) the booster itself would produce for that row.
  2. Consistency: the top-N factors RiskClassifier exposes over the API
     are a correct, correctly-ordered-by-magnitude subset of the full
     per-feature SHAP vector -- i.e. the API isn't silently truncating,
     re-scaling, or mislabeling features on the way out.
"""

import numpy as np
import pytest

from main import app, ARTIFACTS_DIR
from models.risk_classifier import RiskClassifier
from schemas.inference_contracts import PredictionRequest
from datetime import datetime, timedelta, timezone

FEEDER_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"

# Reconstructing the margin from base_value + shap sum involves float
# arithmetic through two separate code paths (SHAP's internal tree walk vs
# LightGBM's own raw-score output), so allow a small numerical tolerance
# rather than demanding bit-exact equality.
ADDITIVITY_TOLERANCE = 1e-4


@pytest.fixture(scope="module")
def classifier():
    return RiskClassifier(ARTIFACTS_DIR)


def _make_valid_readings(
    num_readings: int = 24,
    start_voltage: float = 220.0,
    voltage_step: float = -0.75,
    start_load: float = 45.0,
    load_step: float = 1.5,
    fault_hours_ago: tuple[int, ...] = (),
) -> list[dict]:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
    readings = []

    for i in range(num_readings, 0, -1):
        ts = now - timedelta(hours=i)
        hours_elapsed = num_readings - i
        voltage = round(start_voltage + hours_elapsed * voltage_step, 2)
        load = round(start_load + hours_elapsed * load_step, 2)
        fault_count_recent = 1 if i in fault_hours_ago else 0

        readings.append({
            "timestamp": ts.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "voltage": voltage,
            "load": load,
            "fault_count_recent": fault_count_recent,
        })

    return readings


def _valid_payload(**overrides) -> dict:
    payload = {
        "feeder_id": FEEDER_ID,
        "readings": _make_valid_readings(),
    }
    payload.update(overrides)
    return payload


AUDIT_SCENARIOS = {
    "stable_low_risk": dict(
        start_voltage=220.0, voltage_step=-0.1,
        start_load=45.0, load_step=0.1,
        fault_hours_ago=(),
    ),
    "moderate_degradation": dict(
        start_voltage=220.0, voltage_step=-0.75,
        start_load=45.0, load_step=1.5,
        fault_hours_ago=(),
    ),
    "severe_voltage_drop_with_faults": dict(
        start_voltage=205.0, voltage_step=-1.2,
        start_load=60.0, load_step=2.0,
        fault_hours_ago=(6, 2, 1),
    ),
}


def _get_full_shap_vector(classifier, tensor):
    """
    Returns (shap_row, base_value) for the positive class, handling both
    SHAP return formats (list-per-class, or single array) the same way
    RiskClassifier._compute_shap_factors does -- reusing that logic here
    directly would defeat the purpose of an independent audit, so this
    re-derives it deliberately.
    """
    shap_values = classifier.explainer.shap_values(tensor)
    expected_value = classifier.explainer.expected_value

    if isinstance(shap_values, list):
        # [class_0_array, class_1_array]; we care about the positive class
        row_values = shap_values[1][0]
        base_value = expected_value[1] if isinstance(expected_value, (list, np.ndarray)) else expected_value
    else:
        row_values = shap_values[0]
        base_value = expected_value[0] if isinstance(expected_value, (list, np.ndarray)) else expected_value

    return np.asarray(row_values, dtype=np.float64), float(base_value)


class TestShapAdditivity:
    """
    Verifies base_value + sum(shap_values) reconstructs the model's raw
    margin output (log-odds), per SHAP's mathematical definition, for the
    LightGBM booster directly.
    """

    @pytest.mark.parametrize("scenario_name", AUDIT_SCENARIOS.keys())
    def test_shap_sum_matches_raw_margin(self, classifier, scenario_name):
        scenario_kwargs = AUDIT_SCENARIOS[scenario_name]
        payload_dict = _valid_payload(readings=_make_valid_readings(**scenario_kwargs))
        request = PredictionRequest(**payload_dict)

        tensor = classifier.pipeline.vectorize(request)

        shap_row, base_value = _get_full_shap_vector(classifier, tensor)

        # raw_score=True returns the pre-sigmoid margin (log-odds), which is
        # the quantity SHAP values are defined relative to -- NOT the
        # 0.0-1.0 probability, which would require passing the sum through
        # a sigmoid before comparing.
        raw_margin = float(classifier.booster.predict(tensor, raw_score=True)[0])

        reconstructed = base_value + shap_row.sum()

        diff = abs(reconstructed - raw_margin)
        assert diff <= ADDITIVITY_TOLERANCE, (
            f"[{scenario_name}] SHAP additivity violated: "
            f"base_value({base_value:.6f}) + sum(shap)({shap_row.sum():.6f}) "
            f"= {reconstructed:.6f}, but raw booster margin = {raw_margin:.6f} "
            f"(diff={diff:.6f}, tolerance={ADDITIVITY_TOLERANCE})"
        )

    def test_shap_feature_count_matches_metadata(self, classifier):
        """The full SHAP vector must have exactly one value per trained feature."""
        payload_dict = _valid_payload()
        request = PredictionRequest(**payload_dict)
        tensor = classifier.pipeline.vectorize(request)

        shap_row, _ = _get_full_shap_vector(classifier, tensor)

        expected_feature_count = len(classifier.metadata["feature_order"])
        assert len(shap_row) == expected_feature_count, (
            f"Expected {expected_feature_count} SHAP values "
            f"(one per feature in feature_order), got {len(shap_row)}"
        )


class TestShapApiConsistency:
    """
    Verifies the top-N factors RiskClassifier exposes over the egress
    contract are a faithful subset of the full SHAP vector -- correct
    values, correctly labeled, correctly ordered by magnitude -- not just
    plausible-looking numbers assembled independently.
    """

    @pytest.mark.parametrize("scenario_name", AUDIT_SCENARIOS.keys())
    def test_top_factors_are_correct_subset_of_full_vector(self, classifier, scenario_name):
        scenario_kwargs = AUDIT_SCENARIOS[scenario_name]
        payload_dict = _valid_payload(readings=_make_valid_readings(**scenario_kwargs))
        request = PredictionRequest(**payload_dict)

        tensor = classifier.pipeline.vectorize(request)

        # Full, independently-derived ground truth
        shap_row, _ = _get_full_shap_vector(classifier, tensor)
        feature_order = classifier.metadata["feature_order"]
        full_map = dict(zip(feature_order, shap_row))

        # What the API actually returns for this exact request
        response = classifier.predict(request)
        returned_factors = response.contributing_factors

        assert len(returned_factors) == classifier.TOP_N_FACTORS

        for factor in returned_factors:
            assert factor.feature_name in full_map, (
                f"API returned unknown feature '{factor.feature_name}' "
                f"not present in trained feature_order"
            )
            expected_value = full_map[factor.feature_name]
            assert abs(factor.contribution - expected_value) <= ADDITIVITY_TOLERANCE, (
                f"[{scenario_name}] Feature '{factor.feature_name}': API returned "
                f"{factor.contribution:.6f}, but full SHAP vector has {expected_value:.6f}"
            )

        # Ordering: returned factors must be sorted by descending |contribution|
        magnitudes = [abs(f.contribution) for f in returned_factors]
        assert magnitudes == sorted(magnitudes, reverse=True), (
            "contributing_factors are not sorted by descending magnitude"
        )

        # Correctness of selection: the returned set must actually be the
        # top-N by magnitude from the FULL vector, not an arbitrary subset.
        full_sorted_features = sorted(full_map.items(), key=lambda kv: abs(kv[1]), reverse=True)
        expected_top_features = {name for name, _ in full_sorted_features[: classifier.TOP_N_FACTORS]}
        returned_features = {f.feature_name for f in returned_factors}

        assert returned_features == expected_top_features, (
            f"[{scenario_name}] Returned top-{classifier.TOP_N_FACTORS} features "
            f"{returned_features} do not match the true top-{classifier.TOP_N_FACTORS} "
            f"by magnitude {expected_top_features}"
        )
