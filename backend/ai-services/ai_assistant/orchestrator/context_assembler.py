import os
import re
import json
import logging
from typing import List, Dict, Any, Optional

import httpx
from schemas.assistant_contracts import GatewayQueryPayload, AssistantResponse, Citation

logger = logging.getLogger(__name__)


def assemble_prompt_context(
    payload: GatewayQueryPayload,
    retrieved_records: List[Dict[str, Any]],
    feeder_status: str = "global",
    feeder_suggestions: Optional[List[Dict[str, str]]] = None
) -> List[Dict[str, str]]:
    """
    Structures retrieved documents, telemetry records, and dynamic grid guardrails
    into a strictly enforced, sovereign prompt context.
    """
    # 1. Format Structured Ground Truth Telemetry
    ground_truth_lines = []
    for record in retrieved_records:
        source = record.get("source_table", "unknown")
        snippet = record.get("metric_snippet", "").strip()
        rec_id = record.get("record_id", "N/A")
        ground_truth_lines.append(f"- [Source: {source} | RecordID: {rec_id}]: {snippet}")

    ground_truth_text = (
        "\n".join(ground_truth_lines)
        if ground_truth_lines
        else "NO ACTIVE TELEMETRY OR HISTORICAL ANOMALIES FOUND FOR THIS QUERY SCOPE."
    )

    # 2. Inject Dynamic Feeder Topology Context
    feeder_context_directive = ""
    raw_feeder = payload.feeder_id.strip() if payload.feeder_id else "Unspecified"

    match feeder_status:
        case "resolved_exact":
            feeder_context_directive = (
                f"TARGET FEEDER CONFIRMED: The feeder '{raw_feeder}' is verified in the grid registry. "
                "Confine detailed telemetry answers strictly to this circuit."
            )
        case "resolved_fuzzy":
            feeder_context_directive = (
                f"TARGET FEEDER FUZZY-MATCHED: The query referenced '{raw_feeder}', which resolved to an active feeder. "
                "Inform the operator of the matched feeder designation in your opening sentence."
            )
        case "multiple_matches":
            suggestions_str = ", ".join([f"'{s.get('name')}' ({s.get('id')})" for s in (feeder_suggestions or [])])
            feeder_context_directive = (
                f"AMBIGUOUS FEEDER IDENTIFIER: The input '{raw_feeder}' matched multiple assets: [{suggestions_str}]. "
                "Do NOT guess. Inform the operator of the ambiguity, list these specific options, and request confirmation."
            )
        case "not_found":
            feeder_context_directive = (
                f"UNKNOWN FEEDER: '{raw_feeder}' does not exist in the active grid topology. "
                "Explicitly inform the operator that this feeder ID/name cannot be located in the grid registry. "
                "Do not hallucinate telemetry for non-existent assets."
            )
        case _:
            feeder_context_directive = (
                "GLOBAL GRID QUERY: No specific feeder was targeted. Provide macro-level system intelligence, "
                "or instruct the operator to specify a Feeder UUID/Name if circuit-level telemetry is required."
            )

    # 3. Define the Immutable Sovereign Directives & Guardrails
    system_directive = f"""You are GridSense AI, the sovereign diagnostic intelligence for electrical power distribution grids.
Your mandate is strictly bounded to power systems operations: feeder reliability, load balancing, anomaly classification,
outage analytics (SAIFI/SAIDI), transformer asset health, and Engine A-D operational decision support.

<OPERATIONAL_CONTEXT>
{feeder_context_directive}
</OPERATIONAL_CONTEXT>

<GROUND_TRUTH_TELEMETRY>
{ground_truth_text}
</GROUND_TRUTH_TELEMETRY>

STRICT GOVERNANCE RULES:
1. DOMAIN BOUNDARY GUARDRAIL: You must politely reject any queries unrelated to electric grid infrastructure,
   telemetry, power systems, or operational maintenance (e.g., general programming, creative writing, pop culture).
   State: "I am GridSense AI, sovereign assistant dedicated exclusively to electric grid operations, telemetry analysis, and reliability intelligence. I cannot assist with topics outside distribution network engineering."
   Leave the citations array empty: [].
2. ZERO-HALLUCINATION ENFORCEMENT: Never invent voltages, currents, harmonics, risk scores, or outage timestamps.
   If telemetry is absent or insufficient in the <GROUND_TRUTH_TELEMETRY> block, state explicitly that you lack the telemetry data.
3. EXPLAINABILITY & CITATIONS (XAI): Every diagnostic claim or metric quoted must be backed by a citation from
   <GROUND_TRUTH_TELEMETRY>. Populate the citations array with the exact `source_table`, `record_id` (must be valid UUID),
   and `metric_snippet`.
4. FEEDER RESOLUTION: If the operational context marks the feeder as UNKNOWN or AMBIGUOUS, your primary objective
   is to guide the operator to specify the correct asset.
5. SCHEMA CONFORMANCE: Output must strictly conform to the AssistantResponse JSON schema with no preamble or trailing commentary.
"""

    # 4. Assemble Message Stream
    messages = [{"role": "system", "content": system_directive}]

    # Append sliding window conversation history
    for msg in payload.chat_history:
        messages.append({"role": msg.role, "content": msg.content})

    # Append immediate user query
    messages.append({"role": "user", "content": payload.query})

    return messages


def _clean_json_output(raw_content: str) -> str:
    """
    Strips potential markdown code-fence encapsulation from LLM outputs.
    """
    raw = raw_content.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```(?:json)?\s*", "", raw)
        raw = re.sub(r"\s*```$", "", raw)
    return raw.strip()


async def generate_constrained_response(
    messages: List[Dict[str, str]],
    model_name: Optional[str] = None
) -> AssistantResponse:
    """
    Executes inference via Cerebras Llama 3.1 with automated failover to Cohere v2.
    Implements key rotation, structured JSON parsing, and schema validation.
    """
    # 1. Collect and prioritize API credentials
    cerebras_keys = [
        k for k in [
            os.getenv("CEREBRAS_API_KEY"),
            os.getenv("CEREBRAS_API_KEY_1"),
            os.getenv("CEREBRAS_API_KEY_2")
        ] if k
    ]
    
    cohere_keys = [
        k for k in [
            os.getenv("COHERE_API_KEY"),
            os.getenv("COHERE_API_KEY_1"),
            os.getenv("COHERE_API_KEY_2")
        ] if k
    ]

    schema = AssistantResponse.model_json_schema()
    last_exception: Optional[Exception] = None

    async with httpx.AsyncClient(timeout=35.0) as client:
        # -------------------------------------------------------------
        # Primary Engine: Cerebras Llama 3.1 High-Speed Inference
        # -------------------------------------------------------------
        if cerebras_keys:
            target_model = model_name or os.getenv("CEREBRAS_MODEL", "llama3.1-70b")
            for idx, api_key in enumerate(cerebras_keys):
                try:
                    payload = {
                        "model": target_model,
                        "messages": messages,
                        "temperature": 0.1,
                        "response_format": {"type": "json_object"}
                    }
                    response = await client.post(
                        "https://api.cerebras.ai/v1/chat/completions",
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        }
                    )
                    response.raise_for_status()
                    data = response.json()
                    raw_text = data["choices"][0]["message"]["content"]
                    cleaned_json = _clean_json_output(raw_text)
                    return AssistantResponse.model_validate_json(cleaned_json)

                except Exception as exc:
                    last_exception = exc
                    logger.warning(f"Cerebras key {idx + 1} failed: {exc}. Rotating...")

        # -------------------------------------------------------------
        # Secondary Engine: Cohere Command R+ Failover
        # -------------------------------------------------------------
        if cohere_keys:
            target_model = os.getenv("COHERE_MODEL", "command-r-plus-08-2024")
            for idx, api_key in enumerate(cohere_keys):
                try:
                    payload = {
                        "model": target_model,
                        "messages": messages,
                        "temperature": 0.0,
                        "response_format": {
                            "type": "json_object",
                            "schema": schema
                        }
                    }
                    response = await client.post(
                        "https://api.cohere.com/v2/chat",
                        json=payload,
                        headers={
                            "Authorization": f"Bearer {api_key}",
                            "Content-Type": "application/json"
                        }
                    )
                    response.raise_for_status()
                    data = response.json()
                    raw_text = data.get("message", {}).get("content", [{}])[0].get("text", "{}")
                    cleaned_json = _clean_json_output(raw_text)
                    return AssistantResponse.model_validate_json(cleaned_json)

                except Exception as exc:
                    last_exception = exc
                    logger.warning(f"Cohere key {idx + 1} failed: {exc}. Rotating...")

    raise RuntimeError(
        f"All sovereign LLM endpoints exhausted. Check CEREBRAS_API_KEY / COHERE_API_KEY configuration. "
        f"Underlying error: {last_exception}"
    )