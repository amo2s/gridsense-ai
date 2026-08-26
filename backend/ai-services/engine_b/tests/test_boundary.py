"""
Step 5.1 - Boundary Testing

Validates that the FastAPI /internal/v1/predict endpoint correctly rejects
malformed, out-of-contract payloads via Pydantic (expecting HTTP 422), and
correctly accepts well-formed payloads across the risk spectrum (LOW/HIGH).

Uses FastAPI's TestClient, which runs the app in-process (including the
`lifespan` startup hook), so this exercises the real RiskClassifier loading
path against whatever artifacts currently exist in artifacts/. Run the
training pipeline first if artifacts are missing.
"""

import copy
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from main import app

FEEDER_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"
ENDPOINT = "/internal/v1/predict"


@pytest.fixture(scope="module")
def client():
    """
    TestClient as a context manager triggers the app's lifespan (startup/
    shutdown) exactly once for the whole test module, so RiskClassifier is
    loaded once rather than per-test.
    """
    with TestClient(app) as c:
        yield c


def _make_valid_readings(
    num_readings: int = 24,
    start_voltage: float = 220.0,
    voltage_step: float = -0.75,
    start_load: float = 45.0,
    load_step: float = 1.5,
    fault_hours_ago: tuple[int, ...] = (),
) -> list[dict]:
    """
    Builds a strictly ascending, past-dated sequence of telemetry readings.
    Mirrors the shape used in predict_payload.json so tests stay consistent
    with the manually-verified happy path.
    """
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


# ==========================================
# HAPPY PATH
# ==========================================

class TestHappyPath:
    def test_low_risk_payload_returns_200(self, client):
        """Voltage never crosses the 200V training threshold -> expect LOW risk."""
        payload = _valid_payload()
        resp = client.post(ENDPOINT, json=payload)

        assert resp.status_code == 200
        body = resp.json()

        assert body["feeder_id"] == FEEDER_ID
        assert body["risk_level"] in ("LOW", "MEDIUM", "HIGH")
        assert 0.0 <= body["risk_score"] <= 100.0
        assert body["horizon_hours"] == 6
        assert len(body["contributing_factors"]) > 0
        for factor in body["contributing_factors"]:
            assert "feature_name" in factor
            assert "contribution" in factor

    def test_high_risk_payload_returns_high_tier(self, client):
        """
        Voltage dips below the 200V training threshold with recent faults
        present -> expect the model to score this meaningfully higher than
        the low-risk baseline. We assert relative severity rather than
        pinning an exact tier, since exact thresholds depend on the trained
        model and can shift between retrains.
        """
        low_payload = _valid_payload()
        high_payload = _valid_payload(
            readings=_make_valid_readings(
                start_voltage=205.0,
                voltage_step=-1.2,  # ends well under 200V
                start_load=60.0,
                load_step=2.0,
                fault_hours_ago=(6, 2, 1),
            )
        )

        low_resp = client.post(ENDPOINT, json=low_payload)
        high_resp = client.post(ENDPOINT, json=high_payload)

        assert low_resp.status_code == 200
        assert high_resp.status_code == 200

        low_score = low_resp.json()["risk_score"]
        high_score = high_resp.json()["risk_score"]

        assert high_score > low_score


# ==========================================
# BOUNDARY / REJECTION TESTS
# ==========================================

class TestBoundaryRejections:
    def test_fewer_than_24_readings_rejected(self, client):
        payload = _valid_payload(readings=_make_valid_readings(num_readings=23))
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_out_of_order_timestamps_rejected(self, client):
        payload = _valid_payload()
        # Swap two adjacent readings to break ascending order
        payload["readings"][5], payload["readings"][6] = (
            payload["readings"][6],
            payload["readings"][5],
        )
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422
        assert "ascending chronological order" in resp.text

    def test_duplicate_timestamps_rejected(self, client):
        """Equal (non-strictly-ascending) timestamps should also be rejected."""
        payload = _valid_payload()
        payload["readings"][1]["timestamp"] = payload["readings"][0]["timestamp"]
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_future_timestamp_rejected(self, client):
        payload = _valid_payload()
        future_ts = (datetime.now(timezone.utc) + timedelta(hours=1)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        payload["readings"][-1]["timestamp"] = future_ts
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422
        assert "future timestamps" in resp.text

    def test_unexpected_field_rejected(self, client):
        """extra='forbid' should reject any field not in the schema."""
        payload = _valid_payload()
        payload["unexpected_field"] = "should not be here"
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_unexpected_reading_field_rejected(self, client):
        payload = _valid_payload()
        payload["readings"][0]["extra_sensor_value"] = 42
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_negative_voltage_rejected(self, client):
        payload = _valid_payload()
        payload["readings"][0]["voltage"] = -10.0
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_voltage_above_physical_bound_rejected(self, client):
        """Field constraint: voltage <= 500.0"""
        payload = _valid_payload()
        payload["readings"][0]["voltage"] = 501.0
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_negative_load_rejected(self, client):
        payload = _valid_payload()
        payload["readings"][0]["load"] = -5.0
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_negative_fault_count_rejected(self, client):
        payload = _valid_payload()
        payload["readings"][0]["fault_count_recent"] = -1
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_missing_feeder_id_rejected(self, client):
        payload = _valid_payload()
        del payload["feeder_id"]
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_empty_feeder_id_rejected(self, client):
        """Field constraint: min_length=1"""
        payload = _valid_payload(feeder_id="")
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_missing_readings_field_rejected(self, client):
        payload = _valid_payload()
        del payload["readings"]
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_malformed_timestamp_rejected(self, client):
        payload = _valid_payload()
        payload["readings"][0]["timestamp"] = "not-a-real-date"
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422

    def test_missing_required_reading_field_rejected(self, client):
        payload = _valid_payload()
        del payload["readings"][0]["voltage"]
        resp = client.post(ENDPOINT, json=payload)
        assert resp.status_code == 422


# ==========================================
# SERVICE AVAILABILITY
# ==========================================

class TestHealthCheck:
    def test_health_check_returns_healthy(self, client):
        resp = client.get("/api/v1/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "healthy"
        assert body["service"] == "engine_b_risk"
        assert "model_version" in body
