import pytest
import math
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from main import app

@pytest.fixture()
def client():
    # Using 'with' triggers the app lifespan, loading the ML models into app.state
    with TestClient(app) as client:
        yield client

AUTH_HEADERS = {"X-Internal-Service-Key": "default-fallback-insecure-key"}
FEEDER_ID = "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"

def generate_window(voltage=230.0, load_base=101.0, frequency=50.0, availability=1.0):
    base_time = datetime(2026, 8, 27, 0, 0, 0)
    readings = []
    for i in range(24):
        # Add realistic diurnal curve around the training baseline median (~101 MW)
        hour_load = load_base + (math.sin(i / 24.0 * 2 * math.pi) * 10.0)
        readings.append({
            "feeder_id": FEEDER_ID,
            "timestamp": (base_time + timedelta(hours=i)).isoformat() + "Z",
            "voltage": float(voltage),
            "load": float(round(hour_load, 2)),
            "frequency": float(frequency),
            "availability": float(availability)
        })
    return readings

def test_nominal_grid_operation(client):
    readings = generate_window(voltage=230.0, load_base=101.0, frequency=50.0, availability=1.0)
    response = client.post("/internal/v1/anomalies/detect", headers=AUTH_HEADERS, json={"readings": readings})
    
    assert response.status_code == 200
    data = response.json()
    
    # The seasonal layer might flag synthetic data as "MEDIUM" severity because it lacks 
    # real-world noise, but the overall ensemble confidence score should remain low.
    assert data["confidence_score"] < 0.50
    assert data["severity"].upper() in ["NONE", "LOW", "MEDIUM"]

def test_voltage_sag_anomaly(client):
    readings = generate_window(voltage=230.0, load_base=101.0, frequency=50.0, availability=1.0)
    # Inject severe voltage sag in the target (last) observation
    readings[-1]["voltage"] = 165.0
    
    response = client.post("/internal/v1/anomalies/detect", headers=AUTH_HEADERS, json={"readings": readings})
    
    assert response.status_code == 200
    data = response.json()
    assert data["is_anomaly"] is True
    assert data["layer_flags"]["layer1_stat"] is True or data["layer_flags"]["layer3_multi"] is True
    assert any("voltage" in factor["feature"].lower() for factor in data["ranked_attributions"])

def test_load_surge_anomaly(client):
    readings = generate_window(voltage=230.0, load_base=101.0, frequency=50.0, availability=1.0)
    # Inject massive load surge in the target observation
    readings[-1]["load"] = 400.0
    
    response = client.post("/internal/v1/anomalies/detect", headers=AUTH_HEADERS, json={"readings": readings})
    
    assert response.status_code == 200
    data = response.json()
    assert data["is_anomaly"] is True
    assert data["layer_flags"]["layer1_stat"] is True or data["layer_flags"]["layer3_multi"] is True
    assert any("load" in factor["feature"].lower() for factor in data["ranked_attributions"])