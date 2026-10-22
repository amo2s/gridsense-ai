# Engine D Activity & Implementation Log

Authoritative architecture, forensic mapping, and implementation logs for **Engine D: Intervention Prioritization & Ranking**.

---

### Session Log: Initial Architecture & Frontend Build
* **Subsystem:** Engine D (Intervention Prioritization & Ranking)
* **Date:** October 21, 2026
* **Session Start Time:** `11:06:22 AM +01:00`
* **Phase 1-6 Completion Time:** `11:59:30 AM +01:00`
* **Status:** Initial Build Completed and Verified with `tsc --noEmit`.

---

### Session Log: Architectural Alignment & Batch Paradigm Shift
* **Subsystem:** Engine D (Intervention Prioritization & Ranking)
* **Date:** October 21, 2026
* **Session Start Time:** `12:16:04 PM +01:00`
* **Session Completion Time:** `12:24:10 PM +01:00`
* **Status:** Global Selector Locked (Read-Only Mode), Staging Flow Overhauled, Hook Strictly Gated ($\ge 2$ Feeders).

---

## Architectural Paradigm Shift: Single vs. Multi-Feeder Context

### 1. The Friction Point & Issue Analysis
A fundamental architectural mismatch emerged between GridSense AI's predictive engines (Engines A, B, and C) and the newly integrated prescriptive engine (Engine D):

1. **Single-Feeder Paradigm (Engines A, B, C):**
   * **Domain Question:** *"What is the health, outage probability, or anomaly state for Feeder X?"*
   * **State Model:** Governed by `useFeederStore` (`activeFeederId`), binding the entire UI shell (Topbar, Sidebar, metric cards, time-series charts) to one operational asset at a time.
2. **Multi-Feeder Batch Paradigm (Engine D):**
   * **Domain Question:** *"Out of these $N$ candidate feeders within an operational area, which ones should dispatch crews prioritize first?"*
   * **State Model:** Governed by `useEngineDStore` (`activeAreaId`, `selectedFeeders`), evaluating a comparative listwise learning-to-rank matrix across multiple feeders simultaneously.

### 2. The Resulting Failures
* **UX Clash:** When an operator navigated to the Engine D dashboard, the persistent global Topbar and Sidebar Feeder Selector continued displaying a single feeder (e.g., *"North Corridor Feeder"*). This falsely implied that the operator was inspecting a single asset, when the dashboard was actually presenting an entire prioritized fleet.
* **Gateway HTTP 422 Rejection:** The Go API Gateway's `PrioritizationHandler` strictly validates that candidate assets count is $\ge 2$ (`ErrInsufficientAssets`). When the original ingestion form mimicked Engine B's single-asset baseline, or when `useEngineDQuery` auto-fired on mount with an empty or unseeded feeder array, the Go Gateway instantly rejected the request with HTTP 422 (Unprocessable Entity).

---

### 3. Comprehensive Resolution Strategy

#### A. Global Read-Only Mode (Option B)
* **Route Detection:** Integrated Next.js `usePathname()` within `feeder-selector.tsx` and `topbar.tsx` to detect active Engine D routes (`pathname.includes("/engine-d")`).
* **Visual Lock & Muted State:** Disabled the dropdown trigger button, applied `opacity-75 cursor-not-allowed bg-slate-100/70 border-slate-200/80` visual treatment, replaced the chevron with a `LOCKED` badge, and swapped the status pulse for a static `Layers` batch icon.
* **Text Override:** Replaced the asset name label with:
  > `"Multiple Feeders (Engine D Batch View)"`
* **Non-Destructive:** The component remains mounted in the layout shell to preserve visual balance, but interaction is securely locked to prevent operators from attempting single-asset mutations while viewing fleet rankings.

#### B. Refactored Ingestion & Candidate Staging Flow
* **Elimination of Mock Telemetry:** Stripped all invocations of `generateEngineDFusedBaseline()` and mock JSON generators from `engine-d-form.tsx`.
* **3-Step Staging Pipeline:**
  1. **Step A (Area Selection):** Operator selects an operational grid area (e.g., Central District Sub-Grid, Northern Industrial Sector) or inputs an area UUID, mapping directly to `activeAreaId`.
  2. **Step B (Candidate Checklist):** Renders a multi-feeder checklist populated by the live database hook (`useFeeders()`), complete with status badges, voltage classes, substations, and search/quick-selection filters.
  3. **Step C (Validation & Submission):** Enforces a strict validation boundary requiring `selectedFeeders.length >= 2`. The *"Run Prioritization"* action remains disabled with an explanatory badge until the threshold is satisfied.
* **State Dispatch & Navigation:** On execution, the staged feeder IDs are committed to `useEngineDStore.setSelectedFeeders`, the area is synchronized to `setActiveAreaId`, and the user is programmatically routed to `/dashboard/engine-d`.

#### C. Strictly Gated TanStack Query Hook
* **Query Hook Patch (`use-engine-d-query.ts`):** Added `selectedFeeders` from `useEngineDStore` into the query key and execution body.
* **Execution Gate:** Configured `enabled: Boolean(activeAreaId) && selectedFeeders.length >= 2 && !isCircuitBreakerOpen`.
* **Zero 422 Gateway Rejections:** Prevents premature background requests on mount when fewer than 2 feeders are staged, completely eliminating the Gateway HTTP 422 error loop while providing a clear guidance banner on the dashboard.

---

### 4. Verification & Validation Metrics
* **TypeScript Compilation:** `npx tsc --noEmit` exited with code `0` (Zero errors).
* **Go Backend Compilation:** `go build ./...` exited with code `0` (Zero errors).
* **Go Test Suite:** `go test -v ./handlers/...` passed with code `0`.
* **Live Server Status:** `pnpm dev` running cleanly on port `3000` (PID `12284` / Node PID `17860`).

---

### Session Log: Dedicated End-to-End Ingestion Pipeline (Command Pathway)
* **Subsystem:** Engine D (Intervention Prioritization & Ranking)
* **Date:** October 21, 2026
* **Session Start Time:** `02:21:12 PM +01:00`
* **Session Completion Time:** `02:34:33 PM +01:00`
* **Commit:** `69cea1f` — `feat(engine-d): implement end-to-end ingestion pipeline`
* **Status:** Go Gateway Ingest Handler + Next.js Proxy + Frontend Dispatch Form Implemented, Tested, and Pushed to `origin main`.

---

## 5. Live Terminal & Runtime Environment Audit

### 5.1 Active Process & Network State
* **Command Executed:** `pnpm dev`
* **Working Directory:** `c:\users\hp\Desktop\gridsense-ai\frontend`
* **Process Topology:**
  * **Parent Process (pnpm):** PID `12284`
  * **Child Runtime (Node.js Next.js Dev Server):** PID `17860`, Working Set `~272 MB`
* **Network Binding:**
  * Protocol: `TCP`
  * Local Address: `[::]:3000` / `127.0.0.1:3000` (State: `LISTEN`)
  * Active Ingress Connections: Established (`::1:3000`)
* **Endpoint Probing Results:**
  * `http://localhost:3000/dashboard/engine-d`: `HTTP/1.1 307 Temporary Redirect` (redirecting unauthenticated requests to `/portal?callbackUrl=...`).
  * `http://localhost:3000/dashboard/ingestion/engine-d`: `HTTP/1.1 307 Temporary Redirect` (Next.js auth guard active).
  * `http://localhost:3000/api/proxy/v1/priorities/ingest`: Route mounted and responding to HTTP methods (e.g. `{"error":"Missing Authorization header"}` on unauthenticated test calls).

---

## 6. End-to-End Ingestion Pipeline Architecture (Engine D)

```
[ Frontend Ingestion Form ]
       │  (POST { area_id, selected_feeders })
       ▼
[ Next.js API Proxy Route ] (/api/proxy/v1/priorities/ingest)
       │  (Cookie extraction, Bearer token injection, 30s timeout budget)
       ▼
[ Go API Gateway Handler ] (/api/v1/priorities/ingest)
       │  (5MB body limit, AreaID validation, SelectedFeeders >= 2 check, DB check)
       ▼
[ Standardized HTTP 201 Response ]
       │  (Generated UUID query_id, message, feeders_count, created_at)
       ▼
[ Frontend Store & Navigation ]
          (Save query_id in useEngineDStore, router.push("/dashboard/engine-d"))
```

### Phase 1: Go Backend Gateway Implementation
1. **DTO Contracts (`prioritization_handler.go`):**
   * `EngineDIngestionRequest`: `{ area_id: string, selected_feeders: []string }`
   * `EngineDIngestionResponse`: `{ status: string, message: string, query_id: string, area_id: string, feeders_count: int, created_at: time.Time }`
2. **Ingestion Handler (`IngestEngineD`):**
   * Method enforcement: `POST`.
   * Body cap: `http.MaxBytesReader(w, r.Body, 5*1024*1024)`.
   * Validation 1: `AreaID` must not be empty (HTTP 400 with Pydantic-compatible structured `detail` array).
   * Validation 2: `len(SelectedFeeders) >= 2` (HTTP 422 with structured `detail` array).
   * Database check: Executes `ValidateFeedersExist(ctx, req.SelectedFeeders)` against the PostgreSQL `feeders` table via `pgxPrioritizationRepo`.
   * Success response: Emits HTTP 201 Created with generated UUID `query_id`.
3. **Route Mounting (`cmd/api/main.go`):**
   * Bound `POST /api/v1/priorities/ingest` with `middleware.RequireAuth(cfg.JWTSecret)` and CORS.

### Phase 2: Next.js API Proxy (`route.ts`)
* **Path:** `frontend/app/api/proxy/v1/priorities/ingest/route.ts`
* Replicated established gateway reverse-proxy architecture from Engine B (`prediction/ingest`).
* Extracts `auth_token` or `gridsense_session` from HttpOnly cookies and injects `Authorization: Bearer <token>`.
* Sets upstream target: `${GATEWAY_URL}/api/v1/priorities/ingest`.
* Strict 30-second `AbortController` timeout budget (`BACKEND_TIMEOUT_MS = 30_000`).
* Transparent forwarding of HTTP status codes, error payloads, and diagnostic fallback during local UI development.

### Phase 3: Frontend Ingestion Dispatch (`engine-d-form.tsx`)
* **Dispatch:** Constructs `{ area_id: targetAreaId, selected_feeders: selectedFeederIds }` and dispatches `fetch("/api/proxy/v1/priorities/ingest", { method: "POST", ... })`.
* **Pydantic v2 Error Handling:** Parses `errorData.detail` array, mapping structured validation rejections directly to Sonner toasts and an inline trapped error banner.
* **Success State:** Stores returned `query_id` into Zustand `useEngineDStore.setQueryId(returnedQueryId)` and navigates the operator to `/dashboard/engine-d`.

---

## 7. Verification Summary
* **Gateway Build:** `go build ./...` in `backend/services/gateway` — **PASS** (Exit Code 0).
* **Gateway Unit Tests:** `go test -v ./handlers/...` — **PASS** (Exit Code 0).
* **Frontend TypeScript:** `npx tsc --noEmit` in `frontend` — **PASS** (Exit Code 0).
* **Git Commit & Push:** Commit `69cea1f` pushed cleanly to `origin/main`.

---

### Session Log: Event-Driven Prioritization Pipeline (Engine D Phase 1)
* **Subsystem:** Engine D (Intervention Prioritization & Ranking) & Go API Gateway
* **Date:** October 22, 2026
* **Session Start Time:** `02:38:33 PM +01:00`
* **Completion Time:** `02:55:00 PM +01:00`
* **Status:** Redis Stream Consumer Worker implemented, wired to Go Gateway lifecycle, verified with unit tests, compiled cleanly, and pushed to `main` (`1c093e2`).

---

## 8. Event-Driven Architecture (Phase 1 Implementation)

### A. Architectural Context & Problem Statement
Prior to this phase, Engine D operated strictly as a manual, on-demand query endpoint (`POST /api/v1/priorities/rank`). While Engines A, B, and C continuously stream evaluations and anomalies, an operator had to manually trigger the prioritization process from the UI to generate ranking recommendations. 

The objective of Phase 1 was to transition Engine D to a reactive, event-driven model: **the millisecond Engine C registers a CRITICAL anomaly on any feeder, Engine D must instantly intercept the event, resolve the affected operational area from PostgreSQL, and execute fleet prioritization automatically.**

### B. Summary of File & Logic Changes
1. **Repository Layer (`backend/services/gateway/handlers/prioritization_handler.go`):**
   * Added `GetAreaIDByFeederID(ctx context.Context, feederID string) (string, error)` to the `PrioritizationRepository` interface.
   * Implemented `GetAreaIDByFeederID` on `pgxPrioritizationRepo` executing `SELECT area_id FROM feeders WHERE id = $1;` with a 3-second bounded context and explicit `pgx.ErrNoRows` error handling.
2. **Background Stream Worker (`backend/services/gateway/internal/worker/engine_d_trigger.go`):**
   * Defined `EngineDTriggerWorker` struct encapsulating `redisClient`, `prioritizationRepo`, `aiClient`, and `outcomesRepo`.
   * Constructor `NewEngineDTriggerWorker`: Ensures the Redis Consumer Group `engine-d-workers` exists on stream `gridsense:alerts:stream` with start ID `$` using `XGroupCreateMkStream`, ignoring `BUSYGROUP` errors.
   * Consumer Loop `Run(ctx context.Context)`: Continuously polls Redis Streams using `XReadGroup` (`Count: 10`, `Block: 2s`, Consumer: `gateway-node-1`).
   * Event Filtering: Unmarshals Watermill envelopes (`_watermill_message_payload`) and processes only events matching `source == "Engine C"` and `severity == "CRITICAL"`.
   * Area Resolution & Execution: Resolves `area_id` via `GetAreaIDByFeederID`, executes multi-engine signal fusion and ONNX ranking inference via `ExecutePrioritization`, persists the ranked assets to PostgreSQL `priorities`, and seeds outcome tracking into `intervention_outcomes`.
   * Acknowledgment: Issues `XAck` upon successful completion or when discarding irrelevant/malformed events to keep the Pending Entries List (PEL) clean.
3. **Application Startup Wiring (`backend/services/gateway/cmd/api/main.go`):**
   * Wired `worker.NewEngineDTriggerWorker` with the root `bgCtx` lifecycle so it shuts down gracefully with SIGINT/SIGTERM.
4. **Unit Tests (`backend/services/gateway/internal/worker/engine_d_trigger_test.go`):**
   * Implemented unit tests covering successful prioritization execution, asset threshold guards, and JSON stream payload deserialization.

---

## 9. Difficulties, Errors Encountered & Resolutions

During static compilation and unit testing, four specific technical challenges were diagnosed and resolved:

### 1. Watermill Envelope Payload Shape & Feeder ID Resolution
* **The Problem:** In Engine C (`backend/ai-services/engine_c/core/events.py`), events are published to Redis Streams as a Watermill envelope where the payload dictionary may store `feeder_id` as `"FDR-UNKNOWN"` if the incoming request model lacked a top-level `feeder_id` attribute (since `TelemetryWindowRequest` nests telemetry within a `readings` array).
* **The Resolution:** In `engine_d_trigger.go`, implemented defensive fallback parsing: if `alert.FeederID` is empty or `"FDR-UNKNOWN"`, the worker inspects `alert.MetricsSnapshot["inference_result"]["feeder_id"]` before rejecting the message. Additionally, non-critical or malformed events are acknowledged immediately via `XAck` to prevent poison pills from blocking the consumer group.

### 2. Method Mismatch on `interventionoutcomes.Repository`
* **The Error:** 
  ```
  internal\worker\engine_d_trigger.go:327:28: w.outcomesRepo.SeedFromPrioritization undefined 
  (type interventionoutcomes.Repository has no field or method SeedFromPrioritization)
  ```
* **Root Cause Analysis:** `SeedFromPrioritization` was an internal helper pattern originally considered, but the actual contract on `interventionoutcomes.Repository` is `SeedOutcomes(ctx context.Context, seeds []InterventionSeed) error`.
* **The Resolution:** Refactored `ExecutePrioritization` in `engine_d_trigger.go` to iterate over `rankingResult.RankedAssets`, transform SHAP explanations into `interventionoutcomes.ShapAttribution`, map the generated `intervention_id`s into `interventionoutcomes.InterventionSeed` structs, and invoke `SeedOutcomes(ctx, seeds)` directly.

### 3. Test Mock Signature Incompatibilities
* **The Error:**
  ```
  internal\worker\engine_d_trigger_test.go:94:29: undefined: handlers.PrioritizationRankedAsset
  internal\worker\engine_d_trigger_test.go:119:23: cannot use outcomes as interventionoutcomes.Repository: 
  missing method RecordAction
  ```
* **Root Cause Analysis:** The test fixture initially guessed the struct name `handlers.PrioritizationRankedAsset` (the actual struct is `handlers.RankedAsset`), and `mockOutcomesRepo` omitted `RecordAction`, `RecordOutageCheck`, and `RecordReward` required by `interventionoutcomes.Repository`.
* **The Resolution:** Updated `engine_d_trigger_test.go` to use `handlers.RankedAsset` and implemented the complete interface signatures on `mockOutcomesRepo`.

### 4. Interface Breakage in Existing gRPC Test Suite
* **The Problem:** Adding `GetAreaIDByFeederID` to `handlers.PrioritizationRepository` broke compilation for `fakePrioritizationRepo` in `backend/services/gateway/internal/grpc/alert_service_test.go`.
* **The Resolution:** Added stub implementations for `ValidateFeedersExist` and `GetAreaIDByFeederID` on `fakePrioritizationRepo` in `alert_service_test.go`, restoring full compatibility across all gateway test suites.

---

### Session Log: Scheduled Nightly Batch Pipeline (Engine D Phase 2)
* **Subsystem:** Engine D (Intervention Prioritization & Ranking) & Go API Gateway
* **Date:** October 22, 2026
* **Session Start Time:** `03:00:15 PM +01:00`
* **Completion Time:** `03:08:00 PM +01:00`
* **Status:** Go-native cron scheduler (`github.com/robfig/cron/v3`) implemented, rate-limited sequential area execution verified, integrated with gateway graceful shutdown, unit tested, and compiled cleanly.

---

## 10. Scheduled Batch Pipeline (Phase 2 Implementation)

### A. Architectural Context & Objective
While the event-driven trigger (Phase 1) provides immediate reaction to critical anomalies, grid operators require refreshed baseline priority rankings across the entire power grid before morning dispatch crews deploy. 

Phase 2 deployed an enterprise-standard Go-native cron runner (`robfig/cron/v3`) inside the Go API Gateway scheduled for **02:00 AM UTC daily (`0 2 * * *`)**.

### B. Summary of File & Logic Changes
1. **Dependency Integration (`go.mod`, `go.sum`):**
   * Installed `github.com/robfig/cron/v3 v3.0.1`.
2. **Scheduler Construction (`backend/services/gateway/internal/scheduler/engine_d_batch.go`):**
   * Struct `EngineDBatchScheduler`: Holds references to `cronRunner`, `areaRepo`, `prioritizationRepo`, `aiClient`, and `outcomesRepo`.
   * Constructor `NewEngineDBatchScheduler`: Configures `cron.New(cron.WithLocation(time.UTC))`.
   * Lifecycle Methods:
     * `Start(ctx context.Context)`: Registers cron job `"0 2 * * *"` and starts the runner.
     * `Stop(ctx context.Context)`: Gracefully stops the cron runner, waiting for active jobs to finish or until context expires.
   * Batch Execution (`ExecuteNightlyBatch`):
     * Bounds run with a detached 15-minute background context (`context.WithTimeout(context.Background(), 15*time.Minute)`).
     * Retrieves all operational grid areas via `areaRepo.FetchAllAreas(batchCtx)`.
     * Iterates sequentially over each area, running `ExecutePrioritization` with a 30-second per-area timeout.
     * Injects a 2-second rate-limiting delay between areas (`time.Sleep(2 * time.Second)`) to prevent overloading the Python FastAPI ONNX runtime.
     * Handles `ErrInsufficientAssets` gracefully as a skip, logs any transient failures at area level without aborting the batch, and logs final aggregation metrics.
3. **Application Wiring (`backend/services/gateway/cmd/api/main.go`):**
   * Wired `engineDBatchScheduler := scheduler.NewEngineDBatchScheduler(...)` and started with `engineDBatchScheduler.Start(bgCtx)`.
   * Wired `engineDBatchScheduler.Stop(shutdownCtx)` into the graceful shutdown sequence.
4. **Unit Tests (`backend/services/gateway/internal/scheduler/engine_d_batch_test.go`):**
   * Verified lifecycle start/stop, multi-area sequential execution, and error resilience when encountering areas with insufficient feeders.

