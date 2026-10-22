package worker

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"gateway/handlers"
	interventionoutcomes "gateway/intervention_outcomes"
)

type mockPrioritizationRepo struct {
	areaIDMap      map[string]string
	signalsMap     map[string][]handlers.MultiEngineSignals
	persistedCalls int
	lastPersisted  handlers.PrioritizationResponse
}

func (m *mockPrioritizationRepo) GetAreaIDByFeederID(ctx context.Context, feederID string) (string, error) {
	if areaID, ok := m.areaIDMap[feederID]; ok {
		return areaID, nil
	}
	return "", errors.New("feeder not found")
}

func (m *mockPrioritizationRepo) FetchFusedSignals(ctx context.Context, queryID string) ([]handlers.MultiEngineSignals, error) {
	if sigs, ok := m.signalsMap[queryID]; ok {
		return sigs, nil
	}
	return nil, handlers.ErrInsufficientAssets
}

func (m *mockPrioritizationRepo) PersistPrioritization(ctx context.Context, resp handlers.PrioritizationResponse) (map[string]string, error) {
	m.persistedCalls++
	m.lastPersisted = resp
	out := make(map[string]string)
	for _, a := range resp.RankedAssets {
		out[a.FeederID] = "mock-intervention-" + a.FeederID
	}
	return out, nil
}

func (m *mockPrioritizationRepo) ValidateFeedersExist(ctx context.Context, feederIDs []string) ([]string, error) {
	return feederIDs, nil
}

type mockEngineDClient struct {
	rankCalls int
	response  *handlers.PrioritizationResponse
	err       error
}

func (m *mockEngineDClient) Rank(ctx context.Context, payload []byte) (*handlers.PrioritizationResponse, error) {
	m.rankCalls++
	if m.err != nil {
		return nil, m.err
	}
	return m.response, nil
}

type mockOutcomesRepo struct {
	seededSeeds []interventionoutcomes.InterventionSeed
}

func (m *mockOutcomesRepo) SeedOutcomes(ctx context.Context, seeds []interventionoutcomes.InterventionSeed) error {
	m.seededSeeds = append(m.seededSeeds, seeds...)
	return nil
}

func (m *mockOutcomesRepo) RecordAction(ctx context.Context, id string, action interventionoutcomes.ActionTaken, takenAt time.Time) error {
	return nil
}

func (m *mockOutcomesRepo) RecordOutageCheck(ctx context.Context, id string, outageOccurred bool, checkedAt time.Time) error {
	return nil
}

func (m *mockOutcomesRepo) RecordReward(ctx context.Context, id string, rewardValue float64, computedAt time.Time) error {
	return nil
}

func TestExecutePrioritization_Success(t *testing.T) {
	repo := &mockPrioritizationRepo{
		signalsMap: map[string][]handlers.MultiEngineSignals{
			"area-uuid-1": {
				{FeederID: "fdr-1", ReliabilityScore: 40.0, RiskScore: 85.0},
				{FeederID: "fdr-2", ReliabilityScore: 70.0, RiskScore: 30.0},
			},
		},
	}

	aiClient := &mockEngineDClient{
		response: &handlers.PrioritizationResponse{
			QueryID:     "area-uuid-1",
			GeneratedAt: time.Now(),
			RankedAssets: []handlers.RankedAsset{
				{
					FeederID:      "fdr-1",
					RankPosition:  1,
					PriorityScore: 92.5,
					PriorityTier:  "CRITICAL",
					Explanations: []handlers.ShapAttribution{
						{FeatureName: "RiskScore", Contribution: 0.65},
					},
				},
				{
					FeederID:      "fdr-2",
					RankPosition:  2,
					PriorityScore: 45.0,
					PriorityTier:  "LOW",
				},
			},
		},
	}

	outcomes := &mockOutcomesRepo{}

	w := &EngineDTriggerWorker{
		prioritizationRepo: repo,
		aiClient:           aiClient,
		outcomesRepo:       outcomes,
	}

	err := w.ExecutePrioritization(context.Background(), "area-uuid-1")
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}

	if aiClient.rankCalls != 1 {
		t.Errorf("expected 1 rank call, got %d", aiClient.rankCalls)
	}
	if repo.persistedCalls != 1 {
		t.Errorf("expected 1 persist call, got %d", repo.persistedCalls)
	}
	if len(outcomes.seededSeeds) != 2 {
		t.Errorf("expected 2 seeded outcomes, got %d", len(outcomes.seededSeeds))
	}
}

func TestExecutePrioritization_InsufficientAssets(t *testing.T) {
	repo := &mockPrioritizationRepo{
		signalsMap: map[string][]handlers.MultiEngineSignals{}, // missing
	}

	aiClient := &mockEngineDClient{}

	w := &EngineDTriggerWorker{
		prioritizationRepo: repo,
		aiClient:           aiClient,
	}

	err := w.ExecutePrioritization(context.Background(), "non-existent-area")
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !errors.Is(err, handlers.ErrInsufficientAssets) {
		t.Errorf("expected ErrInsufficientAssets wrapped, got %v", err)
	}
}

func TestAnomalyStreamPayload_Serialization(t *testing.T) {
	rawJSON := `{
		"event_id": "evt-1234",
		"trace_id": "trc-5678",
		"type": "FEEDER_ANOMALY",
		"timestamp": "2026-10-22T12:00:00Z",
		"source": "Engine C",
		"feeder_id": "FDR-ALPHA",
		"risk_score": 95.0,
		"severity": "CRITICAL",
		"metrics_snapshot": {
			"inference_result": {
				"feeder_id": "FDR-ALPHA",
				"is_anomaly": true
			}
		}
	}`

	var p AnomalyStreamPayload
	if err := json.Unmarshal([]byte(rawJSON), &p); err != nil {
		t.Fatalf("unmarshal failed: %v", err)
	}

	if p.Source != "Engine C" {
		t.Errorf("expected source Engine C, got %s", p.Source)
	}
	if p.Severity != "CRITICAL" {
		t.Errorf("expected severity CRITICAL, got %s", p.Severity)
	}
	if p.FeederID != "FDR-ALPHA" {
		t.Errorf("expected feeder FDR-ALPHA, got %s", p.FeederID)
	}
	if p.RiskScore != 95.0 {
		t.Errorf("expected risk score 95.0, got %f", p.RiskScore)
	}
}
