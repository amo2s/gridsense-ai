"""
Step 5.2 - Parity Verification

Guarantees the compiled ONNX artifact used in production inference
(risk_model.onnx) produces mathematically equivalent probabilities to the
original LightGBM booster it was compiled from (champion_model.txt).

This is the test that actually catches ONNX conversion bugs -- precision
loss during opset conversion, wrong output structure assumptions in
RiskClassifier._run_onnx_inference, etc. -- which boundary/schema tests
(test_boundary.py) cannot detect, since those only check HTTP-layer
contract enforcement, not numerical correctness of the model itself.

Two things are verified:
  1. Cross-engine parity: ONNX probability vs. native booster probability
     for the same input tensor, across a spread of feature vectors.
  2. Determinism: repeated calls with an identical input yield identical
     output, both through the live HTTP endpoint and directly through
     RiskClassifier -- guarding against any hidden non-determinism
     (e.g. unseeded randomness accidentally leaking into inference).
"""

import os
from datetime import datetime, timedelta, timezone

import numpy as np
import lightgbm as lgb
import pytest
from fastapi.testclient import TestClient

from main import app, ARTIFACTS_DIR
from models.risk_classifier import RiskClassifier

FEEDER_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"
ENDPOINT = "/internal/v1/predict"

# Acceptable absolute difference between ONNX and native booster probability
# outputs. ONNX conversion introduces float32 rounding versus LightGBM's
# native float64 path, so exact equality isn't realistic -- but any
# divergence beyond this points to a real conversion or mapping bug.
PARITY_TOLERANCE = 1e-4


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def classifier():
    """
    A RiskClassifier instance built directly (outside the FastAPI lifespan)
    so we can reach into its ONNX session and native booster independently.
    """
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


# A spread of scenarios covering the low, mid, and high ends of the input
# space the model was trained on, so parity isn't only checked at one point.
PARITY_SCENARIOS = {
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
    "high_load_no_fault": dict(
        start_voltage=220.0, voltage_step=-0.3,
        start_load=90.0, load_step=3.0,
        fault_hours_ago=(),
    ),
}


class TestOnnxNativeParity:
    """
    For each scenario, vectorizes the same payload once, then runs that
    identical tensor through both the ONNX session and the native LightGBM
    booster, asserting the resulting positive-class probabilities agree
    within PARITY_TOLERANCE.
    """

    @pytest.mark.parametrize("scenario_name", PARITY_SCENARIOS.keys())
    def test_onnx_matches_native_booster(self, classifier, scenario_name):
        from schemas.inference_contracts import PredictionRequest

        scenario_kwargs = PARITY_SCENARIOS[scenario_name]
        payload_dict = _valid_payload(readings=_make_valid_readings(**scenario_kwargs))
        request = PredictionRequest(**payload_dict)

        tensor = classifier.pipeline.vectorize(request)

        # --- ONNX path (same code RiskClassifier.predict uses in production) ---
        onnx_probability = classifier._run_onnx_inference(tensor)

        # --- Native LightGBM booster path (ground truth) ---
        # Booster.predict on a binary classifier returns P(class=1) directly.
        native_probability = float(classifier.booster.predict(tensor)[0])

        diff = abs(onnx_probability - native_probability)
        assert diff <= PARITY_TOLERANCE, (
            f"[{scenario_name}] ONNX/native probability mismatch: "
            f"onnx={onnx_probability:.6f} native={native_probability:.6f} diff={diff:.6f} "
            f"(tolerance={PARITY_TOLERANCE})"
        )

    def test_onnx_matches_native_booster_at_scale(self, classifier):
        """
        Sanity-checks parity across a larger batch of randomized-but-valid
        feature vectors in one shot, rather than only the hand-picked
        scenarios above. Uses the raw feature tensor path directly (bypassing
        FeaturePipeline) so we can cheaply generate many rows.
        """
        rng = np.random.default_rng(seed=42)
        n_samples = 200
        n_features = len(classifier.metadata["feature_order"])

        # Build synthetic tensors within physically plausible ranges rather
        # than pure random noise, so we're testing the model on inputs
        # resembling what it was actually trained on.
        synthetic_rows = []
        for _ in range(n_samples):
            row = {
                "voltage": rng.uniform(180.0, 240.0),
                "load": rng.uniform(20.0, 120.0),
                "fault_count_recent": float(rng.integers(0, 3)),
                "hour_sin": rng.uniform(-1.0, 1.0),
                "hour_cos": rng.uniform(-1.0, 1.0),
                "load_volatility_24h": rng.uniform(0.0, 15.0),
                "voltage_mean_12h": rng.uniform(180.0, 240.0),
            }
            synthetic_rows.append([row.get(f, 0.0) for f in classifier.metadata["feature_order"]])

        tensor = np.array(synthetic_rows, dtype=np.float32)

        input_name = classifier.session.get_inputs()[0].name
        onnx_outs = classifier.session.run(None, {input_name: tensor})
        native_probs = classifier.booster.predict(tensor)

        onnx_probs_raw = onnx_outs[1]
        max_diff = 0.0
        for i in range(n_samples):
            if isinstance(onnx_probs_raw, list):
                onnx_p = float(onnx_probs_raw[i].get(1, onnx_probs_raw[i].get("1", 0.0)))
            else:
                arr = np.asarray(onnx_probs_raw)
                onnx_p = float(arr[i][1]) if arr.ndim == 2 else float(arr[i])

            diff = abs(onnx_p - float(native_probs[i]))
            max_diff = max(max_diff, diff)

        assert max_diff <= PARITY_TOLERANCE, (
            f"Max ONNX/native divergence across {n_samples} samples was "
            f"{max_diff:.6f}, exceeding tolerance {PARITY_TOLERANCE}"
        )


class TestDeterminism:
    """
    The same input should always produce the same output. This guards
    against unseeded randomness (e.g. an accidental dropout/sampling step,
    or non-deterministic ONNX execution provider behavior) silently
    creeping into the inference path.
    """

    def test_repeated_http_calls_are_identical(self, client):
        payload = _valid_payload()

        first = client.post(ENDPOINT, json=payload).json()
        second = client.post(ENDPOINT, json=payload).json()
        third = client.post(ENDPOINT, json=payload).json()

        assert first["risk_score"] == second["risk_score"] == third["risk_score"]
        assert first["risk_level"] == second["risk_level"] == third["risk_level"]
        assert first["contributing_factors"] == second["contributing_factors"] == third["contributing_factors"]

    def test_repeated_direct_calls_are_identical(self, classifier):
        from schemas.inference_contracts import PredictionRequest

        payload_dict = _valid_payload()
        request = PredictionRequest(**payload_dict)

        first = classifier.predict(request)
        second = classifier.predict(request)

        assert first.risk_score == second.risk_score
        assert first.risk_level == second.risk_level
        assert [f.model_dump() for f in first.contributing_factors] == [
            f.model_dump() for f in second.contributing_factors
        ]
