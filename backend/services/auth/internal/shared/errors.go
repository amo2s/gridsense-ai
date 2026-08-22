package shared

import (
	"encoding/json"
	"log"
	"net/http"
)

// APIResponse dictates the exact JSON structure the frontend will always receive.
// By enforcing this struct, the frontend never has to guess the shape of the data.
type APIResponse struct {
	Status  string      `json:"status"`            // "success" or "error"
	Code    string      `json:"code,omitempty"`    // e.g., "UNAUTHORIZED", "VALIDATION_FAILED"
	Message string      `json:"message,omitempty"` // Sanitized, human-readable message
	Data    interface{} `json:"data,omitempty"`    // The actual payload (if successful)
}

// WriteJSON is the master engine for sending all HTTP responses.
// It automatically sets headers and handles encoding failures safely.
func WriteJSON(w http.ResponseWriter, statusCode int, payload APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("[CRITICAL] Failed to encode JSON response: %v", err)
	}
}

// WriteError intercepts failures, logs the naked error for developers, 
// and sends a sanitized APIResponse to the client.
func WriteError(w http.ResponseWriter, statusCode int, errorCode, publicMessage string, rawErr error) {
	// 1. Log the naked, technical error to the backend console ONLY.
	if rawErr != nil {
		log.Printf("[ERROR] Code: %s | Msg: %s | Raw: %v", errorCode, publicMessage, rawErr)
	}

	// 2. Construct the sanitized JSON response for the frontend.
	payload := APIResponse{
		Status:  "error",
		Code:    errorCode,
		Message: publicMessage,
	}

	WriteJSON(w, statusCode, payload)
}

// =========================================================================
// Sentinel HTTP Error Helpers
// Use these directly in your route handlers to keep them extremely clean.
// =========================================================================

// RespondBadRequest (400) - Used when the user sends invalid JSON or fails validation.
func RespondBadRequest(w http.ResponseWriter, message string, err error) {
	WriteError(w, http.StatusBadRequest, "BAD_REQUEST", message, err)
}

// RespondUnauthorized (401) - Used for invalid passwords, missing tokens, or expired sessions.
func RespondUnauthorized(w http.ResponseWriter, message string, err error) {
	WriteError(w, http.StatusUnauthorized, "UNAUTHORIZED", message, err)
}

// RespondForbidden (403) - Used when a valid user tries to access something above their role.
func RespondForbidden(w http.ResponseWriter, message string, err error) {
	WriteError(w, http.StatusForbidden, "FORBIDDEN", message, err)
}

// RespondInternal (500) - The ultimate safety net. Hides database crashes or code panics.
func RespondInternal(w http.ResponseWriter, err error) {
	// Notice how we hardcode the public message so we NEVER leak database internals.
	WriteError(w, http.StatusInternalServerError, "INTERNAL_SERVER_ERROR", "An unexpected system error occurred. Please try again later.", err)
}

// RespondSuccess (200/201) - Used to send successful payloads.
func RespondSuccess(w http.ResponseWriter, statusCode int, data interface{}) {
	payload := APIResponse{
		Status: "success",
		Data:   data,
	}
	WriteJSON(w, statusCode, payload)
}