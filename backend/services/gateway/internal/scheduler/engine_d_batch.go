package scheduler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/robfig/cron/v3"

	"gateway/handlers"
	interventionoutcomes "gateway/intervention_outcomes"
)

// EngineDBatchScheduler runs a scheduled nightly batch job at 02:00 AM UTC
// to calibrate Engine D intervention prioritizations across all operational areas.
type EngineDBatchScheduler struct {
	cronRunner         *cron.Cron
	areaRepo           handlers.AreaRepository
	prioritizationRepo handlers.PrioritizationRepository
	aiClient           handlers.EngineDClient
	outcomesRepo       interventionoutcomes.Repository
}

// NewEngineDBatchScheduler constructs a new batch scheduler instance configured with UTC location.
func NewEngineDBatchScheduler(
	areaRepo handlers.AreaRepository,
	prioritizationRepo handlers.PrioritizationRepository,
	aiClient handlers.EngineDClient,
	outcomesRepo ...interventionoutcomes.Repository,
) *EngineDBatchScheduler {
	var ocRepo interventionoutcomes.Repository
	if len(outcomesRepo) > 0 {
		ocRepo = outcomesRepo[0]
	}

	c := cron.New(cron.WithLocation(time.UTC))

	return &EngineDBatchScheduler{
		cronRunner:         c,
		areaRepo:           areaRepo,
		prioritizationRepo: prioritizationRepo,
		aiClient:           aiClient,
		outcomesRepo:       ocRepo,
	}
}

// Start registers the nightly cron schedule ("0 2 * * *") and starts the scheduler runner.
func (s *EngineDBatchScheduler) Start(ctx context.Context) {
	_, err := s.cronRunner.AddFunc("0 2 * * *", func() {
		s.ExecuteNightlyBatch()
	})
	if err != nil {
		slog.Error("Failed to register Engine D nightly batch cron job", "cron", "0 2 * * *", "error", err)
		return
	}

	s.cronRunner.Start()
	slog.Info("Engine D nightly batch scheduler started", "cron", "0 2 * * *", "tz", "UTC")
}

// Stop gracefully stops the cron scheduler, waiting for active jobs to finish or until ctx expires.
func (s *EngineDBatchScheduler) Stop(ctx context.Context) {
	slog.Info("Stopping Engine D nightly batch scheduler...")
	stopCtx := s.cronRunner.Stop()
	select {
	case <-stopCtx.Done():
		slog.Info("Engine D nightly batch scheduler stopped cleanly")
	case <-ctx.Done():
		slog.Warn("Engine D nightly batch scheduler stop timed out with context")
	}
}

// ExecuteNightlyBatch sequentially iterates over all operational areas, executes Engine D
// multi-engine fusion and ranking inference, and persists updated recommendations.
func (s *EngineDBatchScheduler) ExecuteNightlyBatch() {
	batchCtx, cancel := context.WithTimeout(context.Background(), 15*time.Minute)
	defer cancel()

	areas, err := s.areaRepo.FetchAllAreas(batchCtx)
	if err != nil {
		slog.Error("Failed to fetch areas for Engine D nightly batch", "error", err)
		return
	}

	slog.Info("Starting Engine D nightly batch", "total_areas", len(areas))

	successCount := 0
	skippedCount := 0
	failureCount := 0

	for i, area := range areas {
		if batchCtx.Err() != nil {
			slog.Warn("Engine D nightly batch aborted: batch context timed out or canceled",
				"processed", i,
				"total", len(areas),
			)
			return
		}

		slog.Info("Processing area in nightly batch",
			"index", i+1,
			"total", len(areas),
			"area_id", area.ID,
			"area_name", area.Name,
		)

		areaCtx, areaCancel := context.WithTimeout(batchCtx, 30*time.Second)
		err := s.ExecutePrioritization(areaCtx, area.ID)
		areaCancel()

		if err != nil {
			if errors.Is(err, handlers.ErrInsufficientAssets) {
				slog.Warn("Skipping area in nightly batch: insufficient assets (< 2 feeders)",
					"area_id", area.ID,
					"area_name", area.Name,
				)
				skippedCount++
			} else {
				slog.Error("Batch failure for area",
					"area_id", area.ID,
					"area_name", area.Name,
					"error", err,
				)
				failureCount++
			}
		} else {
			slog.Info("Successfully calibrated Engine D prioritization for area",
				"area_id", area.ID,
				"area_name", area.Name,
			)
			successCount++
		}

		// Crucial rate-limiting throttle between areas to prevent DDoSing the Python FastAPI AI service
		if i < len(areas)-1 {
			time.Sleep(2 * time.Second)
		}
	}

	slog.Info("Engine D nightly batch completed",
		"total_areas", len(areas),
		"succeeded", successCount,
		"skipped", skippedCount,
		"failed", failureCount,
	)
}

// ExecutePrioritization executes the end-to-end prioritization pipeline for a single area.
func (s *EngineDBatchScheduler) ExecutePrioritization(ctx context.Context, areaID string) error {
	signals, err := s.prioritizationRepo.FetchFusedSignals(ctx, areaID)
	if err != nil {
		return fmt.Errorf("failed to fetch fused signals for area %s: %w", areaID, err)
	}

	payloadBytes, err := json.Marshal(handlers.PrioritizationRequest{
		QueryID: areaID,
		Assets:  signals,
	})
	if err != nil {
		return fmt.Errorf("failed to marshal prioritization payload: %w", err)
	}

	rankingResult, err := s.aiClient.Rank(ctx, payloadBytes)
	if err != nil {
		return fmt.Errorf("engine d inference failed for area %s: %w", areaID, err)
	}

	interventionIDs, err := s.prioritizationRepo.PersistPrioritization(ctx, *rankingResult)
	if err != nil {
		return fmt.Errorf("failed to persist prioritization for area %s: %w", areaID, err)
	}

	if s.outcomesRepo != nil {
		seeds := make([]interventionoutcomes.InterventionSeed, 0, len(rankingResult.RankedAssets))
		for _, asset := range rankingResult.RankedAssets {
			id, ok := interventionIDs[asset.FeederID]
			if !ok {
				continue
			}
			shapFeatures := make([]interventionoutcomes.ShapAttribution, len(asset.Explanations))
			for i, exp := range asset.Explanations {
				shapFeatures[i] = interventionoutcomes.ShapAttribution{
					FeatureName:  exp.FeatureName,
					Contribution: exp.Contribution,
				}
			}
			seeds = append(seeds, interventionoutcomes.InterventionSeed{
				ID:                     id,
				QueryID:                rankingResult.QueryID,
				FeederID:               asset.FeederID,
				PredictedPriorityScore: asset.PriorityScore,
				PredictedPriorityTier:  asset.PriorityTier,
				ShapTopFeatures:        shapFeatures,
			})
		}

		if err := s.outcomesRepo.SeedOutcomes(ctx, seeds); err != nil {
			slog.Error("failed to seed intervention outcomes during batch run",
				"area_id", areaID,
				"error", err,
			)
		}
	}

	return nil
}
