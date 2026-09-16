import os
import httpx
import logging
from typing import List, Dict, Any
from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse

logger = logging.getLogger(__name__)

def assemble_prompt_context(
    payload: GatewayQueryPayload,
    retrieved_records: List[Dict[str, Any]]
) -> List[Dict[str, str]]:
    """
    Structures the retrieved documents and metrics into an immutable system prompt string.
    Combines the system directive, ground truth data, and chat history into a message array.
    """
    
    # 1. Format the Fenced Ground Truth Data
    ground_truth_text = ""
    for record in retrieved_records:
        source = record.get("source_table", "unknown")
        snippet = record.get("metric_snippet", "")
        rec_id = record.get("record_id", "N/A")
        ground_truth_text += f"- [Source: {source} | ID: {rec_id}]: {snippet}\n"

    if not ground_truth_text:
        ground_truth_text = "No relevant historical grid data found for this query."

    # 2. Define the Immutable System Directive
    system_directive = f"""You are the GridSense AI, a sovereign explainable AI assistant.
Your strictly enforced mandate is to analyze grid telemetry and provide operational decision support.

<GROUND_TRUTH_DATA>
{ground_truth_text}
</GROUND_TRUTH_DATA>

INSTRUCTIONS:
1. You must ONLY use the information provided in the <GROUND_TRUTH_DATA> block to answer the user.
2. If the user's query cannot be answered using the provided ground truth, state explicitly that you lack the telemetry to answer.
3. Do not invent, hallucinate, or assume grid metrics.
4. You must cite your sources from the ground truth data using the provided record IDs and source tables.
5. You must output your response in strictly valid JSON format.
"""

    # 3. Construct the Message Array
    messages = [{"role": "system", "content": system_directive}]

    # 4. Append Session State Windowing (Chat History)
    for msg in payload.chat_history:
        messages.append({"role": msg.role, "content": msg.content})

    # 5. Append Current User Intent
    messages.append({"role": "user", "content": payload.query})

    return messages

async def generate_constrained_response(
    messages: List[Dict[str, str]], 
    model_name: str = "gpt-oss-120b"
) -> AssistantResponse:
    """
    Routes the assembled prompt to the Cerebras API.
    Implements failover key rotation and strictly enforces the JSON schema.
    """
    # 1. Load Keys and Initialize Rotation
    keys = [
        os.getenv("CEREBRAS_API_KEY_1"),
        os.getenv("CEREBRAS_API_KEY_2")
    ]
    valid_keys = [k for k in keys if k]
    
    if not valid_keys:
        raise ValueError("Critical: No Cerebras API keys found in environment variables.")

    # 2. Extract Pydantic Schema for OpenAI-compatible payload
    schema = AssistantResponse.model_json_schema()
    
    payload = {
        "model": model_name,
        "messages": messages,
        "temperature": 0.0,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "AssistantResponseSchema",
                "schema": schema,
                "strict": True
            }
        }
    }
    
    last_exception = None
    
    # 3. Execute HTTP Post with Failover Loop
    async with httpx.AsyncClient() as client:
        for attempt, api_key in enumerate(valid_keys):
            try:
                response = await client.post(
                    "https://api.cerebras.ai/v1/chat/completions",
                    json=payload,
                    headers={"Authorization": f"Bearer {api_key}"},
                    timeout=30.0
                )
                response.raise_for_status()
                
                # 4. Extract Output
                data = response.json()
                raw_content = data.get("choices", [{}])[0].get("message", {}).get("content", "{}")
                
                # 5. Validate against Pydantic contract
                return AssistantResponse.model_validate_json(raw_content)
                
            except httpx.HTTPStatusError as e:
                last_exception = e
                if attempt < len(valid_keys) - 1:
                    logger.warning(f"Key {attempt + 1} failed with status {e.response.status_code}. Rotating to failover key.")
                    continue
                break
                
            except Exception as e:
                last_exception = e
                if attempt < len(valid_keys) - 1:
                    logger.warning(f"Request failed: {str(e)}. Rotating to failover key.")
                    continue
                break
                
    raise RuntimeError(f"Cerebras API inference failed across all keys. Last error: {str(last_exception)}")