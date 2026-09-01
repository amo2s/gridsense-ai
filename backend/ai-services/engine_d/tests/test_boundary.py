"""
Phase 7.1 - Boundary Testing
Verifies schemas/ranking_contracts.py rejects malformed payloads before
they reach the real .onnx artifact, and that valid boundary payloads
produce a valid inference from the real model. Also verifies
models/hybrid_ranker.py's tensor-level validation (_validate_inputs),
since Pydantic only guards the HTTP boundary, not the inference boundary.
"""

import os
import numpy as np
import onnxruntime as ort
import pytest
from pydantic import ValidationError

from schemas.ranking_contracts import MultiEngineSignals
from models.hybrid_ranker import execute_ranking, InferenceError

# Must match training script's feature order EXACTLY - the ONNX model has
# no concept of column names, only positional float32 input.
FEATURE_ORDER = [
    "reliability_score", "duration_penalty", "frequency_penalty",
    "risk_score", "is_anomaly", "anomaly_confidence"
]

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ONNX_MODEL_PATH = os.path.join(BASE_DIR, "artifacts", "hybrid_ranker.onnx")


@pytest.fixture(scope="module")
def onnx_session():
    if not os.path.exists(ONNX_MODEL_PATH):
        pytest.skip(f"artifact not found at {ONNX_MODEL_PATH}")
    return ort.InferenceSession(ONNX_MODEL_PATH)


def _valid_payload(**overrides):
    payload = {
        "feeder_id": "FDR-1",
        "reliability_score": 50.0,
        "duration_penalty": 0.5,
        "frequency_penalty": 0.5,
        "risk_score": 50.0,
        "is_anomaly": False,
        "anomaly_confidence": 0.5,
    }
    payload.update(overrides)
    return payload


# ==========================================
# 1. SCHEMA REJECTION TESTS (Pydantic / HTTP boundary)
# ==========================================

@pytest.mark.parametrize("overrides,bad_field", [
    ({"risk_score": -0.5}, "risk_score"),
    ({"risk_score": 150.0}, "risk_score"),
    ({"anomaly_confidence": 1.5}, "anomaly_confidence"),
    ({"anomaly_confidence": -0.1}, "anomaly_confidence"),
    ({"reliability_score": -1.0}, "reliability_score"),
    ({"is_anomaly": "not_a_boolean"}, "is_anomaly"),
    ({"duration_penalty": "high"}, "duration_penalty"),
    ({"feeder_id": ""}, "feeder_id"),
])
def test_rejects_out_of_range_or_wrong_type(overrides, bad_field):
    payload = _valid_payload(**overrides)
    with pytest.raises(ValidationError) as exc_info:
        MultiEngineSignals(**payload)
    assert bad_field in str(exc_info.value)


@pytest.mark.parametrize("missing_field", FEATURE_ORDER + ["feeder_id"])
def test_rejects_missing_required_field(missing_field):
    payload = _valid_payload()
    del payload[missing_field]
    with pytest.raises(ValidationError) as exc_info:
        MultiEngineSignals(**payload)
    assert missing_field in str(exc_info.value)


def test_rejects_unexpected_extra_field():
    payload = _valid_payload(unexpected_field="should_not_exist")
    with pytest.raises(ValidationError):
        MultiEngineSignals(**payload)


def test_rejects_mutation_after_creation():
    """model_config is frozen=True — confirm immutability is actually enforced."""
    instance = MultiEngineSignals(**_valid_payload())
    with pytest.raises(ValidationError):
        instance.risk_score = 99.0


# ==========================================
# 2. VALID BOUNDARY -> REAL ONNX INFERENCE
# ==========================================

@pytest.mark.parametrize("overrides", [
    {},  # mid-range defaults
    {"reliability_score": 0.0, "risk_score": 0.0, "anomaly_confidence": 0.0,
     "duration_penalty": 0.0, "frequency_penalty": 0.0},  # lower bound
    {"reliability_score": 100.0, "risk_score": 100.0, "anomaly_confidence": 1.0,
     "duration_penalty": 1.0, "frequency_penalty": 1.0, "is_anomaly": True},  # upper bound
])
def test_valid_boundary_payload_infers_successfully(onnx_session, overrides):
    payload = _valid_payload(**overrides)
    validated = MultiEngineSignals(**payload)

    row = np.array(
        [[float(getattr(validated, f)) for f in FEATURE_ORDER]],
        dtype=np.float32,
    )

    outputs = onnx_session.run(None, {"float_input": row})

    assert outputs[0].shape[0] == 1
    assert np.isfinite(outputs[0]).all()


# ==========================================
# 3. TENSOR-LEVEL BOUNDARY TESTS (hybrid_ranker._validate_inputs)
# ==========================================
# Pydantic only guards the HTTP request boundary. These test the deeper
# inference boundary directly, in case a caller ever builds input_tensor
# manually (e.g. a future batch/offline scoring path) that bypasses the
# Pydantic schema entirely.

def test_execute_ranking_rejects_wrong_feature_count(onnx_session):
    bad_tensor = np.zeros((2, len(FEATURE_ORDER) - 1), dtype=np.float32)
    with pytest.raises(InferenceError):
        execute_ranking(
            ort_session=onnx_session,
            input_tensor=bad_tensor,
            feeder_ids=["FDR-1", "FDR-2"],
            query_id="test-query",
        )


def test_execute_ranking_rejects_feeder_id_count_mismatch(onnx_session):
    tensor = np.full((2, len(FEATURE_ORDER)), 0.5, dtype=np.float32)
    with pytest.raises(InferenceError):
        execute_ranking(
            ort_session=onnx_session,
            input_tensor=tensor,
            feeder_ids=["FDR-1"],  # only 1 id for 2 rows
            query_id="test-query",
        )


def test_execute_ranking_rejects_nan_input(onnx_session):
    tensor = np.full((2, len(FEATURE_ORDER)), 0.5, dtype=np.float32)
    tensor[0, 0] = np.nan
    with pytest.raises(InferenceError):
        execute_ranking(
            ort_session=onnx_session,
            input_tensor=tensor,
            feeder_ids=["FDR-1", "FDR-2"],
            query_id="test-query",
        )


def test_execute_ranking_rejects_inf_input(onnx_session):
    tensor = np.full((2, len(FEATURE_ORDER)), 0.5, dtype=np.float32)
    tensor[1, 3] = np.inf
    with pytest.raises(InferenceError):
        execute_ranking(
            ort_session=onnx_session,
            input_tensor=tensor,
            feeder_ids=["FDR-1", "FDR-2"],
            query_id="test-query",
        )