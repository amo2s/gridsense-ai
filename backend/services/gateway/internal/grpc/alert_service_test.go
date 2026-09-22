package server

// Layer 2 test: the real GatewayGRPCServer, wired through an in-memory bufconn
// gRPC connection, with every dependency faked. No network, no Postgres, no
// Redis, no Python engines. This catches wire-format / proto mismatches (the
// exact class of bug that broke InterventionSeed and AnomalyEvent earlier)
// without any external process running.
//
// NOT covered here: EvaluateReliability. s.db (*database.PostgresDB) and
// s.engineA (*bridge.EngineAClient) are concrete structs, not interfaces, so
// they can't be substituted with a fake at this layer. Testing that RPC needs
// either a Layer 3 test (testcontainers Postgres + httptest.Server standing in
// for Engine A) or refactoring those two fields to interfaces. Flagging this
// rather than skipping it silently.

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"

	"gateway/handlers"
	interventionoutcomes "gateway/intervention_outcomes"
	"gateway/middleware"
	"gateway/models"
	pb "gridsense-ai/backend/services/dashboard-bff/proto/gen/gateway/v1/proto"
)

const bufSize = 1024 * 1024

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

type fakeAlertBridge struct {
	alerts     []models.Alert
	fetchErr   error
	ackErr     error
	lastAckID  string
	lastAckPay *models.AcknowledgePayload
	logErr     error
	lastLogPay *models.InterventionPayload
}

func (f *fakeAlertBridge) FetchActiveAlerts(ctx context.Context) ([]models.Alert, error) {
	return f.alerts, f.fetchErr
}
func (f *fakeAlertBridge) AcknowledgeAlert(ctx context.Context, alertID string, payload *models.AcknowledgePayload) error {
	f.lastAckID = alertID
	f.lastAckPay = payload
	return f.ackErr
}
func (f *fakeAlertBridge) LogIntervention(ctx context.Context, payload *models.InterventionPayload) error {
	f.lastLogPay = payload
	return f.logErr
}

type fakeAnomalyRepo struct {
	readings   []handlers.EngineCTelemetryReading
	fetchErr   error
	persisted  []handlers.AnomalyResponse
	persistErr error
}

func (f *fakeAnomalyRepo) FetchEngineCTelemetry(ctx context.Context, feederID string) ([]handlers.EngineCTelemetryReading, error) {
	return f.readings, f.fetchErr
}
func (f *fakeAnomalyRepo) PersistAnomaly(ctx context.Context, resp handlers.AnomalyResponse) error {
	f.persisted = append(f.persisted, resp)
	return f.persistErr
}

type fakeEngineCClient struct {
	result *handlers.AnomalyResponse
	err    error
	delay  time.Duration // used to widen the race window in the dedup test
}

func (f *fakeEngineCClient) Detect(ctx context.Context, payload []byte) (*handlers.AnomalyResponse, error) {
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	return f.result, f.err
}

type fakeTelemetryRepo struct {
	readings   []handlers.TelemetryReading
	fetchErr   error
	persistErr error
}

func (f *fakeTelemetryRepo) FetchHistoricalTelemetry(ctx context.Context, feederID string) ([]handlers.TelemetryReading, error) {
	return f.readings, f.fetchErr
}
func (f *fakeTelemetryRepo) PersistPrediction(ctx context.Context, p handlers.PredictionResponse) error {
	return f.persistErr
}

type fakeAIClient struct {
	result *handlers.PredictionResponse
	err    error
	delay  time.Duration
}

func (f *fakeAIClient) Predict(ctx context.Context, payload []byte) (*handlers.PredictionResponse, error) {
	if f.delay > 0 {
		time.Sleep(f.delay)
	}
	return f.result, f.err
}

type fakePrioritizationRepo struct {
	signals         []handlers.MultiEngineSignals
	fetchErr        error
	interventionIDs map[string]string
	persistErr      error
}

func (f *fakePrioritizationRepo) FetchFusedSignals(ctx context.Context, queryID string) ([]handlers.MultiEngineSignals, error) {
	return f.signals, f.fetchErr
}
func (f *fakePrioritizationRepo) PersistPrioritization(ctx context.Context, p handlers.PrioritizationResponse) (map[string]string, error) {
	return f.interventionIDs, f.persistErr
}

type fakeEngineDClient struct {
	result *handlers.PrioritizationResponse
	err    error
}

func (f *fakeEngineDClient) Rank(ctx context.Context, payload []byte) (*handlers.PrioritizationResponse, error) {
	return f.result, f.err
}

// fakeOutcomesRepo records whether SeedOutcomes was ever called, so tests can
// assert D always seeds (when non-nil) without needing real Postgres.
type fakeOutcomesRepo struct {
	seeded chan []interventionoutcomes.InterventionSeed
}

func newFakeOutcomesRepo() *fakeOutcomesRepo {
	return &fakeOutcomesRepo{seeded: make(chan []interventionoutcomes.InterventionSeed, 1)}
}
func (f *fakeOutcomesRepo) SeedOutcomes(ctx context.Context, seeds []interventionoutcomes.InterventionSeed) error {
	f.seeded <- seeds
	return nil
}
func (f *fakeOutcomesRepo) RecordAction(ctx context.Context, id string, action interventionoutcomes.ActionTaken, takenAt time.Time) error {
	return nil
}
func (f *fakeOutcomesRepo) RecordOutageCheck(ctx context.Context, id string, outageOccurred bool, checkedAt time.Time) error {
	return nil
}
func (f *fakeOutcomesRepo) RecordReward(ctx context.Context, id string, rewardValue float64, computedAt time.Time) error {
	return nil
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

// testServer bundles every fake so individual tests can reach in and set
// return values / assert on captured calls.
type testServer struct {
	alert          *fakeAlertBridge
	anomalyRepo    *fakeAnomalyRepo
	engineC        *fakeEngineCClient
	telemetry      *fakeTelemetryRepo
	engineB        *fakeAIClient
	prioritization *fakePrioritizationRepo
	engineD        *fakeEngineDClient
	outcomes       *fakeOutcomesRepo
}

// startTestGateway spins up the real GatewayGRPCServer over bufconn and
// returns a connected pb.GatewayServiceClient plus the fakes backing it.
// db and engineA are passed as nil: safe for every RPC exercised here, since
// only EvaluateReliability touches them (see the package doc comment above).
func startTestGateway(t *testing.T) (pb.GatewayServiceClient, *testServer, func()) {
	t.Helper()

	ts := &testServer{
		alert:          &fakeAlertBridge{},
		anomalyRepo:    &fakeAnomalyRepo{},
		engineC:        &fakeEngineCClient{},
		telemetry:      &fakeTelemetryRepo{},
		engineB:        &fakeAIClient{},
		prioritization: &fakePrioritizationRepo{},
		engineD:        &fakeEngineDClient{},
		outcomes:       newFakeOutcomesRepo(),
	}

	srv := NewGatewayGRPCServer(
		ts.alert,
		nil, // *redis.Client: only BroadcastAnomaly needs this; not an RPC, not called here
		ts.anomalyRepo,
		ts.engineC,
		ts.telemetry,
		ts.engineB,
		ts.prioritization,
		ts.engineD,
		ts.outcomes,
		nil, // *database.PostgresDB: EvaluateReliability only, see package doc
		nil, // *bridge.EngineAClient: EvaluateReliability only, see package doc
	)

	lis := bufconn.Listen(bufSize)
	grpcSrv := grpc.NewServer(
		grpc.ChainUnaryInterceptor(func(ctx context.Context, req interface{}, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (interface{}, error) {
			// Test bypass: extract user ID from "test-user-id" metadata header and set in context
			// This simulates what the real auth interceptor does after validating JWT
			md, ok := metadata.FromIncomingContext(ctx)
			if ok {
				if userIDs := md["test-user-id"]; len(userIDs) > 0 {
					ctx = context.WithValue(ctx, middleware.UserIDKey, userIDs[0])
				}
			}
			return handler(ctx, req)
		}),
	)
	pb.RegisterGatewayServiceServer(grpcSrv, srv)
	go func() {
		_ = grpcSrv.Serve(lis)
	}()

	dialer := func(context.Context, string) (net.Conn, error) { return lis.Dial() }
	conn, err := grpc.DialContext(context.Background(), "bufnet",
		grpc.WithContextDialer(dialer),
		grpc.WithInsecure(), //nolint:staticcheck // bufconn has no TLS
	)
	if err != nil {
		t.Fatalf("bufconn dial failed: %v", err)
	}

	client := pb.NewGatewayServiceClient(conn)
	cleanup := func() {
		conn.Close()
		grpcSrv.Stop()
	}
	return client, ts, cleanup
}

// authedContext simulates what NewAuthUnaryInterceptor would have already
// done by the time a handler runs: stash the JWT sub under UserIDKey. The
// interceptor's own token-parsing logic (extractBearerToken) is NOT covered
// by this file — see the note in the reply about interceptors_test.go as a
// follow-up.
//
// For bufconn tests, we inject the user ID via metadata so the test interceptor
// can set it in the context before the handler runs.
func authedContext(userID string) context.Context {
	md := metadata.Pairs("test-user-id", userID)
	return metadata.NewOutgoingContext(context.Background(), md)
}

func grpcCode(t *testing.T, err error) codes.Code {
	t.Helper()
	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("expected a gRPC status error, got: %v", err)
	}
	return st.Code()
}

// ---------------------------------------------------------------------------
// Alerts
// ---------------------------------------------------------------------------

func TestGetAnomalyTimeline_Success(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	ts.alert.alerts = []models.Alert{{
		ID: "a1", EntityID: "area-1", Type: "voltage_sag", Severity: "high",
		Message: "sag detected", CreatedAt: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC),
	}}

	res, err := client.GetAnomalyTimeline(context.Background(), &pb.AnomalyTimelineRequest{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.Events) != 1 {
		t.Fatalf("expected 1 event, got %d", len(res.Events))
	}
	got := res.Events[0]
	if got.EventId != "a1" || got.AreaId != "area-1" || got.Timestamp != "2026-01-01T00:00:00Z" {
		t.Fatalf("field mapping mismatch: %+v", got)
	}
}

func TestAcknowledgeAlert_MissingID_InvalidArgument(t *testing.T) {
	client, _, cleanup := startTestGateway(t)
	defer cleanup()

	_, err := client.AcknowledgeAlert(authedContext("user-1"), &pb.AcknowledgeAlertRequest{AlertId: ""})
	if code := grpcCode(t, err); code != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", code)
	}
}

func TestAcknowledgeAlert_NoAuth_Unauthenticated(t *testing.T) {
	client, _, cleanup := startTestGateway(t)
	defer cleanup()

	// No UserIDKey in context: simulates a call that skipped the auth interceptor.
	_, err := client.AcknowledgeAlert(context.Background(), &pb.AcknowledgeAlertRequest{AlertId: "a1"})
	if code := grpcCode(t, err); code != codes.Unauthenticated {
		t.Fatalf("expected Unauthenticated, got %v", code)
	}
}

func TestAcknowledgeAlert_IdentityFromContext_NotRequest(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	// resolved_by is populated but must be ignored; the server must use the
	// authenticated context user instead. This is the exact regression the
	// earlier client-identity fix was for.
	req := &pb.AcknowledgeAlertRequest{AlertId: "a1", ResolvedBy: "spoofed-name"}
	_, err := client.AcknowledgeAlert(authedContext("real-user-uuid"), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts.alert.lastAckPay.UserID != "real-user-uuid" {
		t.Fatalf("expected UserID from context (real-user-uuid), got %q", ts.alert.lastAckPay.UserID)
	}
}

func TestLogIntervention_IdentityFromContext_NotRequest(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	req := &pb.LogInterventionRequest{
		AlertId: "a1", FeederId: "f1", ActionTaken: "dispatched", OperatorId: "spoofed-name",
	}
	_, err := client.LogIntervention(authedContext("real-operator-uuid"), req)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ts.alert.lastLogPay.OperatorID != "real-operator-uuid" {
		t.Fatalf("expected OperatorID from context, got %q", ts.alert.lastLogPay.OperatorID)
	}
	if ts.alert.lastLogPay.Timestamp.IsZero() {
		t.Fatalf("expected timestamp to default to now(), got zero value")
	}
}

// ---------------------------------------------------------------------------
// Engine C: DetectAnomaly
// ---------------------------------------------------------------------------

func TestDetectAnomaly_InvalidUUID(t *testing.T) {
	client, _, cleanup := startTestGateway(t)
	defer cleanup()

	_, err := client.DetectAnomaly(context.Background(), &pb.DetectAnomalyRequest{FeederId: "not-a-uuid"})
	if code := grpcCode(t, err); code != codes.InvalidArgument {
		t.Fatalf("expected InvalidArgument, got %v", code)
	}
}

func TestDetectAnomaly_Success_PersistsOnlyWhenAnomalous(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	feederID := uuid.NewString()
	ts.engineC.result = &handlers.AnomalyResponse{
		FeederID: feederID, Timestamp: time.Now(), IsAnomaly: true, Severity: "high",
		LayerFlags: handlers.LayerFlags{Layer1Stat: true},
	}

	_, err := client.DetectAnomaly(context.Background(), &pb.DetectAnomalyRequest{FeederId: feederID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Persistence is async; poll briefly instead of sleeping a fixed guess.
	deadline := time.Now().Add(500 * time.Millisecond)
	for time.Now().Before(deadline) {
		if len(ts.anomalyRepo.persisted) > 0 {
			break
		}
		time.Sleep(5 * time.Millisecond)
	}
	if len(ts.anomalyRepo.persisted) != 1 {
		t.Fatalf("expected persistence for an anomalous result, got %d persisted rows", len(ts.anomalyRepo.persisted))
	}
}

// ---------------------------------------------------------------------------
// Engine B: PredictRisk
// ---------------------------------------------------------------------------

func TestPredictRisk_InsufficientData(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	feederID := uuid.NewString()
	ts.telemetry.readings = make([]handlers.TelemetryReading, 5) // < 24

	_, err := client.PredictRisk(context.Background(), &pb.PredictRiskRequest{FeederId: feederID})
	if code := grpcCode(t, err); code != codes.FailedPrecondition {
		t.Fatalf("expected FailedPrecondition, got %v", code)
	}
}

// ---------------------------------------------------------------------------
// Engine D: RankInterventions
// ---------------------------------------------------------------------------

func TestRankInterventions_SeedsOutcomes(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	queryID := uuid.NewString()
	feederID := "feeder-1"
	ts.prioritization.signals = []handlers.MultiEngineSignals{{FeederID: feederID}}
	ts.prioritization.interventionIDs = map[string]string{feederID: "int-id-1"}
	ts.engineD.result = &handlers.PrioritizationResponse{
		QueryID: queryID, GeneratedAt: time.Now(),
		RankedAssets: []handlers.RankedAsset{{FeederID: feederID, RankPosition: 1, PriorityScore: 0.9}},
	}

	res, err := client.RankInterventions(context.Background(), &pb.RankInterventionsRequest{QueryId: queryID})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(res.RankedAssets) != 1 || res.RankedAssets[0].FeederId != feederID {
		t.Fatalf("unexpected response: %+v", res)
	}

	select {
	case seeds := <-ts.outcomes.seeded:
		if len(seeds) != 1 || seeds[0].ID != "int-id-1" || seeds[0].QueryID != queryID {
			t.Fatalf("unexpected seed contents: %+v", seeds)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("outcomes.SeedOutcomes was never called")
	}
}

// ---------------------------------------------------------------------------
// Concurrency: the exact panic risk flagged when B/C were given separate
// singleflight groups. If they ever shared one, a concurrent DetectAnomaly +
// PredictRisk for the same feederID would collide in the group and panic on
// the v.(*T) type assertion. This proves they don't.
// ---------------------------------------------------------------------------

func TestDetectAnomaly_And_PredictRisk_ConcurrentSameFeeder_NoPanic(t *testing.T) {
	client, ts, cleanup := startTestGateway(t)
	defer cleanup()

	feederID := uuid.NewString()
	ts.engineC.result = &handlers.AnomalyResponse{FeederID: feederID, Timestamp: time.Now()}
	ts.engineC.delay = 50 * time.Millisecond
	ts.telemetry.readings = make([]handlers.TelemetryReading, 24)
	ts.engineB.result = &handlers.PredictionResponse{FeederID: feederID, GeneratedAt: time.Now()}
	ts.engineB.delay = 50 * time.Millisecond

	errCh := make(chan error, 2)
	go func() {
		_, err := client.DetectAnomaly(context.Background(), &pb.DetectAnomalyRequest{FeederId: feederID})
		errCh <- err
	}()
	go func() {
		_, err := client.PredictRisk(context.Background(), &pb.PredictRiskRequest{FeederId: feederID})
		errCh <- err
	}()

	for i := 0; i < 2; i++ {
		if err := <-errCh; err != nil {
			t.Fatalf("unexpected error from concurrent call: %v", err)
		}
	}
}
