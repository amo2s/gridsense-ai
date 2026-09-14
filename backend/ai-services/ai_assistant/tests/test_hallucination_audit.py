import uuid
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse, Citation
from orchestrator.context_assembler import assemble_prompt_context, generate_constrained_response


# =========================================================
# Phase 6: Hallucination Prevention & Context Audits
# =========================================================

def test_prompt_assembly_fences_empty_telemetry():
    """
    Audit 1: Asserts that when the retrieval pipeline finds no telemetry,
    the prompt strictly injects an explicit refusal signal and fences it,
    preventing the model from assuming or inventing metrics.
    """
    payload = GatewayQueryPayload(
        query="What was the peak load on Feeder Alpha during the storm?",
        feeder_id=str(uuid.uuid4()),
        session_id=str(uuid.uuid4()),
        chat_history=[]
    )
    retrieved_records = []

    messages = assemble_prompt_context(payload, retrieved_records)

    system_message = next(msg["content"] for msg in messages if msg["role"] == "system")
    assert "<GROUND_TRUTH_DATA>" in system_message
    assert "No relevant historical grid data found for this query." in system_message
    assert "You must ONLY use the information provided in the <GROUND_TRUTH_DATA> block" in system_message
    assert "state explicitly that you lack the telemetry to answer" in system_message


def test_prompt_assembly_ground_truth_isolation():
    """
    Audit 2: Asserts that retrieved database records are deterministically formatted
    with source table and record ID tags for verifiable XAI attribution.
    """
    record_id = str(uuid.uuid4())
    payload = GatewayQueryPayload(
        query="Explain the voltage surge detected on feeder beta.",
        feeder_id=str(uuid.uuid4()),
        session_id=str(uuid.uuid4()),
        chat_history=[]
    )
    retrieved_records = [
        {
            "record_id": record_id,
            "source_table": "anomalies",
            "metric_snippet": "Feeder Beta: Phase A voltage surged to 1.18 pu at 14:02 UTC."
        }
    ]

    messages = assemble_prompt_context(payload, retrieved_records)

    system_message = next(msg["content"] for msg in messages if msg["role"] == "system")
    assert f"- [Source: anomalies | ID: {record_id}]: Feeder Beta: Phase A voltage surged to 1.18 pu at 14:02 UTC." in system_message


@pytest.mark.asyncio
async def test_constrained_response_enforces_citations_and_structure():
    """
    Audit 3: Simulates constrained Cerebras LLM egress to verify strict Pydantic
    deserialization and citation attribution compliance.
    """
    sample_id = str(uuid.uuid4())
    mock_llm_json = {
        "choices": [
            {
                "message": {
                    "content": (
                        f'{{"answer": "Overvoltage anomaly detected on Phase A.", '
                        f'"citations": [{{"record_id": "{sample_id}", "source_table": "anomalies", '
                        f'"metric_snippet": "Phase A voltage reached 1.18 pu"}}]}}'
                    )
                }
            }
        ]
    }

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = AsyncMock()
    mock_resp.json = MagicMock(return_value=mock_llm_json)

    messages = [{"role": "system", "content": "Ground truth context"}, {"role": "user", "content": "Status?"}]

    with patch("os.getenv") as mock_env, patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_env.side_effect = lambda k: "mock-key" if "CEREBRAS_API_KEY" in k else None
        mock_post.return_value = mock_resp

        response = await generate_constrained_response(messages)

        assert isinstance(response, AssistantResponse)
        assert response.answer == "Overvoltage anomaly detected on Phase A."
        assert len(response.citations) == 1
        assert response.citations[0].record_id == uuid.UUID(sample_id)
        assert response.citations[0].source_table == "anomalies"


@pytest.mark.asyncio
async def test_constrained_response_rejects_hallucinated_unstructured_output():
    """
    Audit 4: Asserts that if the upstream LLM violates the JSON schema or omits
    mandatory citations, the boundary layer immediately raises a validation failure
    rather than allowing ungrounded responses to reach the Go Gateway.
    """
    mock_corrupted_json = {
        "choices": [
            {
                "message": {
                    "content": '{"answer": "Grid is fine, trust me."}'  # Missing mandatory 'citations'
                }
            }
        ]
    }

    mock_resp = AsyncMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = AsyncMock()
    mock_resp.json = MagicMock(return_value=mock_corrupted_json)

    messages = [{"role": "system", "content": "test"}, {"role": "user", "content": "test"}]

    with patch("os.getenv") as mock_env, patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_env.side_effect = lambda k: "mock-key" if "CEREBRAS_API_KEY" in k else None
        mock_post.return_value = mock_resp

        with pytest.raises(Exception):
            await generate_constrained_response(messages)