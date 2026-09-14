import uuid
import pytest
import httpx
from pydantic import ValidationError
from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse
from main import app

# ==========================================
# Phase 6.2: Schema Boundary Testing
# ==========================================

def test_gateway_payload_rejects_missing_query():
    """Verify Pydantic correctly rejects payloads missing the required 'query' field."""
    invalid_payload = {
        "feeder_id": "FDR-001",
        "chat_history": []
    }
    with pytest.raises(ValidationError) as excinfo:
        GatewayQueryPayload(**invalid_payload)
    
    assert "query" in str(excinfo.value)
    assert "Field required" in str(excinfo.value)

def test_gateway_payload_rejects_malformed_history():
    """Verify Pydantic rejects chat history that violates the ChatMessage contract."""
    invalid_payload = {
        "query": "What is the status of the grid?",
        "chat_history": [{"invalid_key": "user", "text": "hello"}]
    }
    with pytest.raises(ValidationError) as excinfo:
        GatewayQueryPayload(**invalid_payload)
    
    assert "role" in str(excinfo.value)
    assert "content" in str(excinfo.value)

def test_assistant_response_enforces_citations():
    """Verify the egress schema strictly enforces the citation requirement for XAI."""
    invalid_response = {
        "answer": "The grid is stable."
        # Missing 'citations' array
    }
    with pytest.raises(ValidationError) as excinfo:
        AssistantResponse(**invalid_response)
    
    assert "citations" in str(excinfo.value)

def test_assistant_response_valid_contract():
    """Verify a compliant payload successfully validates against UUID and metric_snippet."""
    valid_response = {
        "answer": "Anomaly detected on FDR-001.",
        "citations": [
            {
                "record_id": str(uuid.uuid4()),
                "source_table": "anomalies",
                "metric_snippet": "Grid Anomaly on FDR-001: Detected Overvoltage"
            }
        ]
    }
    obj = AssistantResponse(**valid_response)
    assert obj.answer == "Anomaly detected on FDR-001."
    assert len(obj.citations) == 1

# ==========================================
# Phase 6.2: HTTP In-Memory Boundary Testing
# ==========================================

@pytest.mark.asyncio
async def test_api_rejects_unauthorized_access():
    """Verify the FastAPI middleware rejects requests lacking the internal service key."""
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/assistant/query",
            json={"query": "Test"}
        )
        
    assert response.status_code == 401
    assert "Missing or invalid internal service credentials" in response.text

@pytest.mark.asyncio
async def test_api_rejects_schema_violation():
    """Verify the FastAPI endpoint returns HTTP 422 for non-compliant JSON payloads."""
    # Use the test key or default bypass configured in your settings
    headers = {"X-Internal-Service-Key": "test-key-override"}
    
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.post(
            "/api/assistant/query",
            headers=headers,
            json={"wrong_field": "This should fail Pydantic validation"}
        )
        
    assert response.status_code in [401, 422]