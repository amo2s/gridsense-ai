from typing import List, Literal, Optional
from pydantic import BaseModel, Field, UUID4

class ChatMessage(BaseModel):
    """Represents a single turn in the contextual session state."""
    role: Literal["user", "assistant"] = Field(
        ..., 
        description="The role of the message author."
    )
    content: str = Field(
        ..., 
        min_length=1, 
        description="The textual content of the message."
    )

class GatewayQueryPayload(BaseModel):
    """
    Defines the exact JSON contract expected from the Golang gateway.
    Enforces rigid validation on user intent and session state, with flexible feeder targeting.
    """
    query: str = Field(
        ..., 
        min_length=2, 
        max_length=2000, 
        description="The natural language question or command from the frontend user."
    )
    feeder_id: Optional[str] = Field(
        default=None,
        description="The string identifier of the selected target feeder. Can be a UUID, partial name, or null for global queries."
    )
    session_id: UUID4 = Field(
        ..., 
        description="Unique identifier for the contextual conversation session."
    )
    chat_history: List[ChatMessage] = Field(
        default_factory=list,
        max_length=20,
        description="Chronological list of prior messages representing the session state."
    )

class Citation(BaseModel):
    """Represents a specific historical record or metric retrieved from the system."""
    source_table: str = Field(
        ...,
        description="The database table where the context originated (e.g., anomalies, outage_events)."
    )
    record_id: UUID4 = Field(
        ...,
        description="The specific UUID of the database record used to ground the explanation."
    )
    metric_snippet: str = Field(
        ...,
        description="A brief string containing the exact metric or text used to form the answer."
    )

class AssistantResponse(BaseModel):
    """
    Standardizes the output payload schema.
    Forms the exact JSON schema that the LLM will be strictly constrained to generate.
    """
    answer: str = Field(
        ...,
        description="The natural language response addressing the user intent."
    )
    citations: List[Citation] = Field(
        ...,
        description="An array of approved data and computed analytics retrieved from the system."
    )