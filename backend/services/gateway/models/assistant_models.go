package models

// ==========================================
// Ingestion Contracts (Go Gateway -> Python Assistant)
// ==========================================

// ChatMessage represents a single interaction turn for session context windowing.
type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// GatewayQueryPayload defines the strict JSON payload dispatched to the AI Assistant.
// It maps directly to the Pydantic GatewayQueryPayload in the Python microservice.
type GatewayQueryPayload struct {
	Query       string        `json:"query"`
	FeederID    string        `json:"feeder_id,omitempty"`
	SessionID   string        `json:"session_id"`
	ChatHistory []ChatMessage `json:"chat_history"`
}

// ==========================================
// Egress Contracts (Python Assistant -> Go Gateway)
// ==========================================

// Citation provides deterministic proof of the LLM's claims by mapping directly 
// back to the PostgreSQL pgvector retrieved records, fulfilling the XAI mandate.
type Citation struct {
	RecordID    string `json:"record_id"`
	SourceTable string `json:"source_table"`
	Snippet     string `json:"snippet"`
}

// AssistantResponse represents the rigidly constrained JSON schema returned
// by the LLM and enforced by the Python Pydantic output validation.
type AssistantResponse struct {
	ResponseText string     `json:"response_text"`
	Citations    []Citation `json:"citations"`
}