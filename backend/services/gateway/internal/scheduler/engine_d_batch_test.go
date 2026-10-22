package scheduler

import (
	"context"
	"testing"
	"time"

	"gateway/handlers"
	interventionoutcomes "gateway/intervention_outcomes"
)

type mockAreaRepo struct {
	areas []handlers.AreaSummary
	err   error
}

func (m *mockAreaRepo) FetchAllAreas(ctx context.Context) ([]handlers.AreaSummary, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.areas, nil
}

type mockPrioritizationRepo struct {
	signalsMap     map[string][]handlers.MultiEngineSignals
	persistedCalls int
}

func (m *mockPrioritizationRepo) FetchFusedSignals(ctx context.Context, queryID string) ([]handlers.MultiEngineSignals, error) {
	if sigs, ok := m.signalsMap[queryID]; ok {
		return sigs, nil
	}
	return nil, handlers.ErrInsufficientAssets
}

func (m *mockPrioritizationRepo) PersistPrioritization(ctx context.Context, resp handlers.PrioritizationResponse) (map[string]string, error) {
	m.persistedCalls++
	out := make(map[string]string)
	for _, a := range resp.RankedAssets {
		out[a.FeederID] = "mock-id-" + a.FeederID
	}
	return out, nil
}

func (m *mockPrioritizationRepo) ValidateFeedersExist(ctx context.Context, feederIDs []string) ([]string, error) {
	return feederIDs, nil
}

func (m *mockPrioritizationRepo) GetAreaIDByFeederID(ctx context.Context, feederID string) (string, error) {
	return "test-area-id", nil
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
	seedsCount int
}

func (m *mockOutcomesRepo) SeedOutcomes(ctx context.Context, seeds []interventionoutcomes.InterventionSeed) error {
	m.seedsCount += len(seeds)
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

func TestNewEngineDBatchScheduler_Lifecycle(t *testing.T) {
	areaRepo := &mockAreaRepo{}
	prioRepo := &mockPrioritizationRepo{}
	aiClient := &mockEngineDClient{}

	s := NewEngineDBatchScheduler(areaRepo, prioRepo, aiClient)
	if s == nil {
		t.Fatal("expected non-nil scheduler")
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	s.Start(ctx)

	stopCtx, stopCancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer stopCancel()
	s.Stop(stopCtx)
}

func TestExecuteNightlyBatch_IteratesAllAreas(t *testing.T) {
	areaRepo := &mockAreaRepo{
		areas: []handlers.AreaSummary{
			{ID: "area-1", Name: "Central District", State: "TS"},
			{ID: "area-2", Name: "Industrial Zone", State: "TS"},
		},
	}

	prioRepo := &mockPrioritizationRepo{
		signalsMap: map[string][]handlers.MultiEngineSignals{
			"area-1": {
				{FeederID: "f1", ReliabilityScore: 60.0},
				{FeederID: "f2", ReliabilityScore: 80.0},
			},
			"area-2": {
				{FeederID: "f3", ReliabilityScore: 40.0},
				{FeederID: "f4", ReliabilityScore: 90.0},
			},
		},
	}

	aiClient := &mockEngineDClient{
		response: &handlers.PrioritizationResponse{
			QueryID:     "mock-query",
			GeneratedAt: time.Now(),
			RankedAssets: []handlers.RankedAsset{
				{FeederID: "f1", RankPosition: 1, PriorityScore: 85.0, PriorityTier: "HIGH"},
			},
		},
	}

	outcomes := &mockOutcomesRepo{}

	s := NewEngineDBatchScheduler(areaRepo, prioRepo, aiClient, outcomes)

	// Execute batch synchronously
	s.ExecuteNightlyBatch()

	if prioRepo.persistedCalls != 2 {
		t.Errorf("expected 2 persisted prioritization calls, got %d", prioRepo.persistedCalls)
	}
	if aiClient.rankCalls != 2 {
		t.Errorf("expected 2 rank calls, got %d", aiClient.rankCalls)
	}
}

func TestExecuteNightlyBatch_ContinuesOnAreaFailure(t *testing.T) {
	areaRepo := &mockAreaRepo{
		areas: []handlers.AreaSummary{
			{ID: "area-insufficient", Name: "Single Feeder Area"},
			{ID: "area-success", Name: "Valid Area"},
		},
	}

	// area-insufficient will return ErrInsufficientAssets, area-success has 2 feeders
	prioRepo := &mockPrioritizationRepo{
		signalsMap: map[string][]handlers.MultiEngineSignals{
			"area-success": {
				{FeederID: "f1", ReliabilityScore: 60.0},
				{FeederID: "f2", ReliabilityScore: 80.0},
			},
		},
	}

	aiClient := &mockEngineDClient{
		response: &handlers.PrioritizationResponse{
			QueryID:     "area-success",
			GeneratedAt: time.Now(),
			RankedAssets: []handlers.RankedAsset{
				{FeederID: "f1", RankPosition: 1, PriorityScore: 85.0, PriorityTier: "HIGH"},
			},
		},
	}

	s := NewEngineDBatchScheduler(areaRepo, prioRepo, aiClient)
	s.ExecuteNightlyBatch()

	// Should not abort on area-insufficient, must execute area-success
	if prioRepo.persistedCalls != 1 {
		t.Errorf("expected 1 persisted call for area-success, got %d", prioRepo.persistedCalls)
	}
}
