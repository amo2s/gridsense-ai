import os
import pytest
from fastapi.testclient import TestClient

# Inject the required environment variable for the internal service key BEFORE importing the app.
# This ensures dependencies.py successfully loads the key during test execution.
os.environ["INTERNAL_SERVICE_KEY"] = "test_secret_key_123"

# Import the FastAPI application instance
from main import app

# Initialize the TestClient to mock the ASGI server without binding to a network port
client = TestClient(app)

VALID_HEADERS = {"X-Gateway-Token": "test_secret_key_123"}
EVALUATE_ENDPOINT = "/api/v1/reliability/evaluate"

def get_valid_base_payload() -> dict:
    """Returns a fundamentally sound baseline payload for testing."""
    return {
        "cycle_timestamp": "2026-08-25T00:00:00Z",
        "asset": {
            "feeder_id": "FDR-001",
            "voltage_class": "33kV",
            "capacity_mw": 15.5
        },
        "interruptions": []
    }

# --- 1. Security Gateway Tests ---

def test_missing_gateway_token():
    """Verifies that requests lacking the X-Gateway-Token header are instantly dropped."""
    response = client.post(EVALUATE_ENDPOINT, json=get_valid_base_payload())
    assert response.status_code == 403
    assert "Not authenticated" in response.json()["detail"]

def test_invalid_gateway_token():
    """Verifies that forged or incorrect tokens are rejected to prevent intrusion."""
    headers = {"X-Gateway-Token": "forged_malicious_key"}
    response = client.post(EVALUATE_ENDPOINT, json=get_valid_base_payload(), headers=headers)
    assert response.status_code == 403
    assert "Invalid gateway token" in response.json()["detail"]

# --- 2. Boundary Bombardment Tests ---

@pytest.mark.parametrize(
    "scenario_name, payload_override, expected_error_substring", 
    [
        (
            "severity_breach", 
            # A single outage exceeding the strict 720-minute cap
            {"interruptions": [{"start_time": "2026-08-25T01:00:00Z", "duration_minutes": 721.0}]}, 
            "Input should be less than or equal to 720"
        ),
        (
            "volatility_breach", 
            # 7 discrete outages, breaching the 6-event volatility cap
            {"interruptions": [{"start_time": "2026-08-25T01:00:00Z", "duration_minutes": 10.0}] * 7}, 
            "Frequency marker exceeded"
        ),
        (
            "logical_impossibility", 
            # 3 legally sized outages whose sum exceeds the 1440 minutes in a day
            {"interruptions": [
                {"start_time": "2026-08-25T00:00:00Z", "duration_minutes": 700.0},
                {"start_time": "2026-08-25T12:00:00Z", "duration_minutes": 700.0},
                {"start_time": "2026-08-25T23:00:00Z", "duration_minutes": 50.0}
            ]}, 
            "Logical anomaly"
        ),
        (
            "negative_capacity_anomaly", 
            # Mathematically impossible negative MW capacity
            {"asset": {"feeder_id": "FDR-002", "voltage_class": "11kV", "capacity_mw": -10.5}}, 
            "Input should be greater than 0"
        ),
        (
            "missing_required_metadata", 
            # Stripped asset metadata block
            {"asset": {}}, 
            "Field required"
        ),
    ]
)
def test_payload_rejections(scenario_name, payload_override, expected_error_substring):
    """
    Parametrized test suite that blasts the ingestion boundary with malformed data.
    Ensures Pydantic catches specific breaches and returns 422 Unprocessable Entity.
    """
    payload = get_valid_base_payload()
    payload.update(payload_override)
    
    response = client.post(EVALUATE_ENDPOINT, json=payload, headers=VALID_HEADERS)
    
    # Assert HTTP boundary validation failure
    assert response.status_code == 422
    
    # Extract the Pydantic error trace
    error_detail = str(response.json()["detail"])
    
    # Assert that the exact rule we programmed correctly flagged the failure
    assert expected_error_substring in error_detail, f"Failed on {scenario_name}: Expected error not found."

# --- 3. Base Positive Test ---

def test_valid_payload_acceptance():
    """Ensures a perfectly formed payload successfully penetrates the boundary."""
    response = client.post(EVALUATE_ENDPOINT, json=get_valid_base_payload(), headers=VALID_HEADERS)
    assert response.status_code == 200
    
    data = response.json()
    assert data["reliability_score"] == 100
    assert data["risk_band"] == "STABLE"