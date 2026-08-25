package bridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"gateway/models"
)

// EngineAClient manages HTTP communication with the Python deterministic scoring microservice.
type EngineAClient struct {
	baseURL    string
	serviceKey string
	httpClient *http.Client
}

// NewEngineAClient initializes the bridge client with optimized connection pooling.
func NewEngineAClient(baseURL, serviceKey string) *EngineAClient {
	return &EngineAClient{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
			Transport: &http.Transport{
				MaxIdleConns:        100,
				MaxIdleConnsPerHost: 20,
				IdleConnTimeout:     90 * time.Second,
			},
		},
	}
}

// EvaluateReliability dispatches an OperationalPayload to Engine A and returns the calculated EgressPayload.
func (c *EngineAClient) EvaluateReliability(ctx context.Context, payload *models.OperationalPayload) (*models.EgressPayload, error) {
	endpoint := fmt.Sprintf("%s/api/v1/reliability/evaluate", c.baseURL)

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal operational payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Gateway-Token", c.serviceKey)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("engine A request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("engine A returned status [%d]: %s", resp.StatusCode, string(respBody))
	}

	var result models.EgressPayload
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("failed to decode engine A response: %w", err)
	}

	return &result, nil
}
