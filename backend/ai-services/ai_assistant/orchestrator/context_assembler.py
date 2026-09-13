from typing import List, Dict, Any
from schemas.assistant_contracts import GatewayQueryPayload

def assemble_prompt_context(
    payload: GatewayQueryPayload,
    retrieved_records: List[Dict[str, Any]]
) -> List[Dict[str, str]]:
    """
    Structures the retrieved documents and metrics into an immutable system prompt string[cite: 1].
    Combines the system directive, ground truth data, and chat history into a message array ready for Ollama.
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