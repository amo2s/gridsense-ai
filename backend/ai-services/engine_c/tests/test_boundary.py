import os
from datetime import datetime, timedelta, timezone
import pytest
from fastapi.testclient import TestClient
from main import app

# Load or fallback to the same internal service key used by security/auth.py
VALID_TOKEN = os.getenv("ENGINE_C_INTERNAL_KEY", "default-fallback-insecure-key")
AUTH_HEADERS = {"X-Internal-Service-Key": VALID_TOKEN}


def generate_valid_window(count: int = 24, base_voltage: float = 230.0) -> list[dict]:
    """
    Helper function to generate a strictly ascending, 
    schema-compliant telemetry window for testing.
    """
    base_time = datetime(2026, 8, 26, 0, 0, 0, tzinfo=timezone.utc)
    readings = []
    for i in range(count):
        readings.append({
            "feeder_id": "feeder-test-001",
            "timestamp": (base_time + timedelta(hours=i)).isoformat(),
            "voltage": float(base_voltage),
            "load": 45.0 + (i % 5),
            "frequency": 50.0,
            "availability": 1.0
        })
    return readings


@pytest.fixture(scope="module")
def client():
    """
    Module-scoped TestClient.
    Entering context manager triggers FastAPI's lifespan (model loading).
    """
    with TestClient(app) as test_client:
        yield test_client


# ==========================================
# 1. SECURITY & AUTHENTICATION TESTS (Step 6.1)
# ==========================================

def test_rejects_missing_auth_header(client):
    """Step 6.1.1: Reject calls missing X-Internal-Service-Key with HTTP 401."""
    payload = {"readings": generate_valid_window(24)}
    response = client.post("/internal/v1/anomalies/detect", json=payload)
    assert response.status_code == 401
    assert "Missing required internal authentication header" in response.json()["detail"]


def test_rejects_invalid_auth_token(client):
    """Step 6.1.1: Reject calls with incorrect internal tokens with HTTP 403."""
    payload = {"readings": generate_valid_window(24)}
    headers = {"X-Internal-Service-Key": "unauthorized-malicious-token"}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=headers)
    assert response.status_code == 403
    assert "Invalid internal service token" in response.json()["detail"]


# ==========================================
# 2. SCHEMA & TEMPORAL BOUNDARY TESTS (Step 4.1 & 8.1)
# ==========================================

def test_rejects_insufficient_window_size(client):
    """Step 4.1.1: Reject telemetry windows with length < 24 with HTTP 422."""
    payload = {"readings": generate_valid_window(count=23)}  # 23 points is below minimum
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_rejects_out_of_order_timestamps(client):
    """Step 4.1.1: Enforce strictly ascending chronological ordering with HTTP 422."""
    readings = generate_valid_window(24)
    # Swap last two readings to violate chronological constraint
    readings[-1]["timestamp"], readings[-2]["timestamp"] = readings[-2]["timestamp"], readings[-1]["timestamp"]
    
    payload = {"readings": readings}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422
    assert "strictly chronological" in str(response.json())


def test_rejects_out_of_bounds_voltage(client):
    """Step 1.1.1 & 4.1.1: Reject voltage outside 0-500V range with HTTP 422."""
    readings = generate_valid_window(24)
    readings[-1]["voltage"] = 501.0  # Physical upper limit violation
    
    payload = {"readings": readings}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_rejects_negative_load_and_frequency(client):
    """Step 1.1.1 & 4.1.1: Reject negative load/frequency with HTTP 422."""
    readings = generate_valid_window(24)
    readings[-1]["load"] = -5.0  # Physical negative violation
    
    payload = {"readings": readings}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_rejects_out_of_bounds_availability(client):
    """Step 1.1.1 & 4.1.1: Reject availability outside 0.0-1.0 range with HTTP 422."""
    readings = generate_valid_window(24)
    readings[-1]["availability"] = 1.05  # Must be <= 1.0
    
    payload = {"readings": readings}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422


def test_rejects_unregistered_fields(client):
    """Step 4.1: Reject unregistered fields via ConfigDict(extra='forbid') with HTTP 422."""
    readings = generate_valid_window(24)
    readings[-1]["unauthorized_field"] = 123.45
    
    payload = {"readings": readings}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422


# ==========================================
# 3. NOMINAL INGESTION TEST (Step 4.2)
# ==========================================

def test_accepts_valid_payload_and_conforms_to_contract(client):
    """Step 4.2: Nominal payload passes validation and returns valid AnomalyResponse."""
    payload = {"readings": generate_valid_window(24, base_voltage=230.0)}
    response = client.post("/internal/v1/anomalies/detect", json=payload, headers=AUTH_HEADERS)
    
    assert response.status_code == 200
    data = response.json()
    
    # Contract validation checks
    assert data["feeder_id"] == "feeder-test-001"
    assert "is_anomaly" in data
    assert "severity" in data
    assert data["severity"] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert "confidence_score" in data
    assert 0.0 <= data["confidence_score"] <= 1.0
    assert "layer_flags" in data
    assert "layer1_stat" in data["layer_flags"]
    assert "layer2_seas" in data["layer_flags"]
    assert "layer3_multi" in data["layer_flags"]
    assert "ranked_attributions" in data
    assert "reasons" in data
    assert len(data["reasons"]) > 0
    assert "inference_latency_ms" in data
    assert data["model_version"] is not None