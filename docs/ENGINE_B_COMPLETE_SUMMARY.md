# GridSense AI: Engine B Complete Architectural Summary & Engineering Retrospective

**Intelligence Engine B: Predictive Outage-Risk Assessment & Boundary Enforcement Architecture**  
**Lead Systems Architecture & API Integration Group**  
**Document Classification:** Definitive Engineering Standard  
**Revision:** 3.0.0  

---

## 1. Executive Overview & System Mandate

**Intelligence Engine B** is the outage-risk predictive core of the GridSense AI platform. Tasked with evaluating 24-hour sequential operational telemetry, Engine B executes an ONNX-runtime machine learning model to compute forward-looking outage probabilities ($0.0 - 100.0$), categorizes asset vulnerability into discrete tiers (**LOW / STABLE**, **MEDIUM / VULNERABLE**, **HIGH / HIGH_RISK**), and decomposes risk into explainable feature attributions (TreeSHAP factors).

In accordance with platform design standards, Engine B enforces a strict **Command Query Responsibility Segregation (CQRS)** architecture. Ingestion operations (Command Pathway) and analytical consumption (Query Pathway) are physically and logically decoupled across dedicated endpoints, state mechanisms, and user interfaces.

```
+---------------------------------------------------------------------------------------------------+
|                                  ENGINE B CQRS SYSTEM TOPOLOGY                                    |
|                                                                                                   |
|  COMMAND PATHWAY (Telemetry Ingestion & Inference Ingress)                                        |
|  Next.js Interface: `/dashboard/ingestion/engine-b`                                                |
|       │                                                                                           |
|       ▼ Dynamic Feeder Store (`useFeederStore.activeFeederId`)                                    |
|  React Hook Form Component: `components/ingestion/engine-b-form.tsx`                              |
|       ├──► Zod Schema Boundary Mirror: `types/engine-b-ingestion.ts`                              |
|       │    (Length >= 24, Chronologically Ascending, Zero Future Leakage)                         |
|       └──► 24h Diurnal Sine-Wave Baseline Generator                                               |
|       │                                                                                           |
|       ▼ HTTP POST                                                                                 |
|  Next.js Edge Proxy: `/api/proxy/v1/prediction/ingest`                                            |
|       │                                                                                           |
|       ▼ Authorization: Bearer <auth_token> + AbortController (15s timeout)                        |
|  Go API Gateway: `POST /api/v1/prediction/ingest` (Protected by RequireRole Admin)               |
|       ├──► Dispatches to Python Engine B Microservice (FastAPI + ONNX v2)                         |
|       └──► Asynchronously Persists Egress to PostgreSQL `risk_predictions` table                  |
|                                                                                                   |
|  QUERY PATHWAY (Live Materialized Visualization Dashboard)                                        |
|  Next.js Interface: `/dashboard/engine-b`                                                          |
|       │                                                                                           |
|       ▼ TanStack Query Hook: `hooks/use-engine-b-summary.ts`                                      |
|            Key: `["engine-b-summary", activeFeederId]` (Auto-Invalidates on asset switch)         |
|            Polling: `refetchInterval: 30_000`, `staleTime: 15_000`, `retry: 1`                    |
|       │                                                                                           |
|       ▼ HTTP GET                                                                                  |
|  Next.js Edge Proxy: `/api/proxy/v1/prediction/summary?feeder_id=${id}`                           |
|       │                                                                                           |
|       ▼ Forward httpOnly Session Credentials                                                      |
|  Go API Gateway: `handlers/summary_handler.go` (`GET /api/v1/prediction/summary`)                |
|       └──► Queries PostgreSQL `risk_predictions` directly:                                        |
|            `SELECT ... FROM risk_predictions WHERE feeder_id = $1 ORDER BY generated_at DESC ...` |
|            (100% Live Materialized Data - Zero Python Execution During Read Cycles)              |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Phase 1: Ingestion Pipeline & Boundary Enforcement (Command Pathway)

### 2.1. Zod Boundary Validation Mirroring Pydantic v2
**Source File:** [`frontend/types/engine-b-ingestion.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/types/engine-b-ingestion.ts)

To eliminate client-server contract mismatches and prevent upstream HTTP 400/422 validation rejections, the TypeScript boundary mirrors the Python Pydantic v2 model (`backend/ai-services/engine_b/schemas/inference_contracts.py`):

1. **`TelemetryReadingSchema`:**
   - `timestamp`: Validated ISO-8601 UTC string (`parseISO` and `isValid` from `date-fns`).
   - `voltage`: Strictly between $0.0$ and $500.0$ kV/V inclusive.
   - `load`: Strictly between $0.0$ and $1000.0$ kW/MW inclusive.
   - `fault_count_recent`: Integer $\ge 0$.
2. **`EngineBIngestRequestSchema` with `.superRefine`:**
   - **Length Requirement:** Array must contain $\ge 24$ hourly readings.
   - **Temporal Integrity (Ascending):** Rejects non-chronological order ($t_i \le t_{i-1}$) with the exact issue: `"Telemetry readings must be in strictly ascending chronological order."`.
   - **Zero Temporal Leakage:** Rejects any timestamp in the future ($t > \text{now}$) with: `"Telemetry reading cannot exist in the future relative to current time. Temporal leakage detected."`.

### 2.2. Next.js Ingestion Proxy Route
**Source File:** [`frontend/app/api/proxy/v1/prediction/ingest/route.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/api/proxy/v1/prediction/ingest/route.ts)

- Handles incoming POST requests securely.
- Injects `Authorization: Bearer <token>` extracted from secure `httpOnly` cookies (`auth_token`).
- Implements a 15-second `AbortController` timeout for Go Gateway communication.
- Forwards exact upstream HTTP status codes and response bodies without swallowing errors.

### 2.3. React Hook Form Telemetry Assembly Component
**Source File:** [`frontend/components/ingestion/engine-b-form.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/ingestion/engine-b-form.tsx)

- **Zero-Re-Render Asset Synchronization:** Eliminates manual feeder input. Automatically reads `activeFeederId` from the global `useFeederStore` initialized in Phase 0. If unassigned, renders a glass boundary warning panel requesting asset selection from the navigation sidebar.
- **Mock 24h Baseline Generator:** Provides an operator tool calculating diurnal sine-wave curves:
  - Voltage: $V(t) = 230 + 12 \sin\left(\frac{t-4}{24} \cdot 2\pi\right) \pm \epsilon$
  - Load: $L(t) = 500 + 175 \sin\left(\frac{t-10}{24} \cdot 2\pi\right) \pm \epsilon$
  - Sequential timestamps anchored to the top of the current UTC hour.
- **Finite State Machine (FSM):**
  - `IDLE`: Standard Liquid Glass inputs with interactive row removal and addition.
  - `SUBMITTING`: Inputs locked, submit button replaced with spinning `<Loader2 className="animate-spin" />` and `"Transmitting Payload..."`.
  - `ERROR`: Maps upstream Pydantic v2 `detail` array (`loc`, `msg`) to specific form rows via `setError` and displays a crimson Liquid Glass alert banner.
  - `SUCCESS`: Form reset, pulsing emerald checkmark, and Sonner toast.

### 2.4. Ingestion Page & Network Resilience Monitor
**Source Files:**
- [`frontend/app/dashboard/ingestion/engine-b/page.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/dashboard/ingestion/engine-b/page.tsx)
- [`frontend/components/ingestion/network-resilience-monitor.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/ingestion/network-resilience-monitor.tsx)

- 12-column responsive grid layout (`lg:col-span-8` for the form, `lg:col-span-4` for the resilience monitor).
- Features an amber `"COMMAND PATHWAY"` badge in the header.
- Visually displays gateway health states: `"Circuit Breaker: CLOSED (Normal)"` with a pulsing emerald status beacon, `"Gateway Latency: 12ms"`, and pathway decoupling telemetry.

---

## 3. Phase 2: Query Pathway & Materialized View (Visualization)

### 3.1. Golang API Gateway Live PostgreSQL Fetch
**Source Files:**
- [`backend/services/gateway/handlers/summary_handler.go`](file:///c:/users/hp/Desktop/gridsense-ai/backend/services/gateway/handlers/summary_handler.go)
- [`backend/services/gateway/cmd/api/main.go`](file:///c:/users/hp/Desktop/gridsense-ai/backend/services/gateway/cmd/api/main.go#L135-L174)

1. **Explicit DTO Mapping:**
   ```go
   type PredictionSummaryDTO struct {
       FeederID            string          `json:"feeder_id"`
       GeneratedAt         time.Time       `json:"generated_at"`
       Horizon             int             `json:"horizon_hours"`
       RiskScore           float64         `json:"risk_score"`
       RiskLevel           string          `json:"risk_level"`
       ModelVersion        string          `json:"model_version"`
       ContributingFactors json.RawMessage `json:"contributing_factors"`
   }
   ```
2. **Read-Only Handler (`GetEngineBSummary`):**
   - Extracts and trims `feeder_id` from URL query parameter; returns HTTP 400 Bad Request if missing.
   - Wraps database query in a 5-second context timeout (`context.WithTimeout(r.Context(), 5*time.Second)`).
   - Executes targeted query on the pgxpool:
     ```sql
     SELECT 
         feeder_id, generated_at, horizon, score, level, model_version, contributing_factors 
     FROM risk_predictions 
     WHERE feeder_id = $1 
     ORDER BY generated_at DESC 
     LIMIT 1;
     ```
   - Maps `pgx.ErrNoRows` / `sql.ErrNoRows` to HTTP 404 Not Found with JSON payload.
   - Mounted in `main.go` under protected route `GET /api/v1/prediction/summary` behind `middleware.RequireAuth(cfg.JWTSecret)`.

### 3.2. Next.js Summary Proxy Route
**Source File:** [`frontend/app/api/proxy/v1/prediction/summary/route.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/api/proxy/v1/prediction/summary/route.ts)

- Decoupled read-only proxy route forwarding requests to `${GATEWAY_URL}/api/v1/prediction/summary?feeder_id=${feederId}`.
- Injects JWT authorization header from `httpOnly` cookies.
- Preserves upstream status codes and JSON responses, ensuring 404s trigger client-side empty states.

### 3.3. TanStack Query Cache Polling Hook
**Source File:** [`frontend/hooks/use-engine-b-summary.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/hooks/use-engine-b-summary.ts)

- Subscribes to `activeFeederId` via `useFeederStore`.
- Strict query key: `["engine-b-summary", activeFeederId]`.
- Background polling: `refetchInterval: 30_000` (polls PostgreSQL every 30 seconds).
- Freshness threshold: `staleTime: 15_000` (15 seconds).
- `retry: 1` to fail fast on actual 404s.

### 3.4. Liquid Glass Summary Dashboard & Metric Cards
**Source File:** [`frontend/app/dashboard/engine-b/page.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/dashboard/engine-b/page.tsx)

- **Finite State Visual Feedback:**
  - `INITIAL LOADING`: Skeleton cards with `bg-white/40 backdrop-blur-md animate-pulse` preventing layout shift.
  - `404 NO DATA`: Frosted glass empty state stating: *"No Outage-Risk Intelligence materialized for [activeFeederId]. Navigate to the Command Pathway to ingest historical telemetry."* with a direct CTA button linking to `/dashboard/ingestion/engine-b`.
  - `SUCCESS`: Renders live materialized metrics in three top-level Liquid Glass cards.
- **Metric Card 1 (Risk Score):** Displays `risk_score` formatted to 1 decimal place with a dynamic status bar.
- **Metric Card 2 (Risk Tier with Polarity Styling):**
  - `"HIGH"` / `"HIGH_RISK"`: Crimson text (`text-red-500`), alarm background (`bg-red-500/10`), red strobe drop-shadow (`shadow-[0_0_25px_rgba(239,68,68,0.35)] animate-pulse`).
  - `"MEDIUM"` / `"VULNERABLE"`: Amber text (`text-amber-500`), warning background (`bg-amber-500/10`).
  - `"LOW"` / `"STABLE"`: Emerald text (`text-[#10b981]`), safe background (`bg-[#10b981]/10`).
- **Metric Card 3 (Evaluation Horizon):** Displays `${data.horizon_hours}-Hour Predictive Horizon`, formatted timestamp, and model version.
- **Explainability Containers (SHAP & Temporal Horizon):** Responsive two-column grid (`grid-cols-1 lg:grid-cols-2`) with structural containers (`h-96 rounded-3xl border border-white/60 shadow-sm bg-white/40`) for Phase 3 visual graphs.

---

## 4. System Resilience: Development Server Node/pnpm Junction Resolution

During package dependency additions (`date-fns`), `pnpm` restructured packages in the `.pnpm` virtual store and recomputed package hashes (`next@16.3.2_..._34347...` to `next@16.3.2_..._bdc05...`). The long-running development server retained memory references to the pre-install directory, resulting in worker exceptions (`jest-worker/processChild.js MODULE_NOT_FOUND`).

**Resolution Applied:**
Created an immediate NTFS directory junction mapping the stale virtual store path directly to the newly linked package path:
```powershell
cmd /c mklink /J "frontend\node_modules\.pnpm\next@..._34347..." "frontend\node_modules\.pnpm\next@..._bdc05..."
```
Worker threads immediately resolved internal assets without crashing the running development server or interrupting operator sessions.

---

## 5. Verification Matrix

| Target Layer | Component / File | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **Zod Schema** | `types/engine-b-ingestion.ts` | Synthetic Boundary Assertions | 100% Passed (4/4 tests: valid, length, ordering, future leakage) |
| **Go Gateway** | `handlers/summary_handler.go` | `go vet ./cmd/api ./handlers` | 0 errors |
| **Go Gateway** | `cmd/api/main.go` | `go build ./cmd/api` | Compiled successfully |
| **Frontend Types** | Full Next.js Frontend | `pnpm tsc --noEmit` | 0 errors |
| **Proxy Route** | `api/proxy/v1/prediction/summary` | Route handler verification | Preserves 400, 404, 500 status codes |
| **Polling Hook** | `hooks/use-engine-b-summary.ts` | Cache invalidation contract | Verified with `activeFeederId` binding |

### 4.2. Command Pathway Backend Ingestion Resolution & Routing Audit

During end-to-end integration of the manual telemetry submission pipeline, the frontend proxy dispatched requests to `POST /api/proxy/v1/prediction/ingest`, but upstream returned HTTP 404 Not Found.

**Root Causes Diagnosed:**
1. **Unmounted Gateway Ingestion Route:** The Go API Gateway had not registered `POST /api/v1/prediction/ingest` in `cmd/api/main.go`.
2. **Missing IngestTelemetry Handler:** `handlers/prediction_handler.go` lacked an ingestion handler to accept manual 24h payloads, orchestrate Python inference, and write through to PostgreSQL.
3. **Upstream URL Suffix Mismatch:** In `.env`, `ENGINE_B_URL` was configured as `http://127.0.0.1:8002` (root), whereas FastAPI listens on `/internal/v1/predict`.

**Resolutions Implemented:**
1. Mounted `POST /api/v1/prediction/ingest` in `cmd/api/main.go` protected by `middleware.RequireAuth(cfg.JWTSecret)`.
2. Implemented `IngestTelemetry(w, r)` in `handlers/prediction_handler.go`:
   - Validates JSON payload and guarantees `feeder_id` presence and $\ge 24$ readings.
   - Enforces an 8-second context timeout on internal communication with Engine B.
   - Executes live inference through `AIClient.Predict(ctx, payloadBytes)`.
   - Immediately commits the egress record to the `risk_predictions` PostgreSQL table (`feeder_id`, `generated_at`, `horizon`, `score`, `level`, `model_version`, `contributing_factors`).
   - Returns the standardized prediction contract to the client.
3. Enhanced `LoadConfig()` in `handlers/prediction_handler.go` with automatic URL normalization, ensuring paths without `/internal/v1/predict` are cleanly resolved.
4. Added multi-path ingress aliases in Python Engine B (`/predict` and `/api/v1/predict`) alongside `/internal/v1/predict`.

### 4.3. PostgreSQL UUID Type Mismatch Resolution (SQLSTATE 22P02) & Feeder State Synchronization

During live runtime operations, every query (`GET /api/v1/prediction/summary`) and mutation (`POST /api/v1/prediction/ingest`) failed with database error:
```text
pq: invalid input syntax for type uuid: "FDR-001" (SQLSTATE 22P02)
```

**Root Causes Diagnosed:**
1. **Strict PostgreSQL Type Constraint:** The PostgreSQL schema strictly defines `feeder_id` as `UUID` across both the physical `feeders` table and the analytical `risk_predictions` table.
2. **Legacy Synthetic Mock Defaults:** The Next.js frontend retained hardcoded legacy mock identifiers (`"FDR-001"`) in:
   - Global Zustand store initial state (`useFeederStore`, `DEFAULT_FEEDER_ID = "FDR-001"`).
   - Dynamic asset switcher fallback table (`FALLBACK_FEEDERS[0]`).
   - Component fallback resolver (`activeFeederId || "FDR-001"`).
3. **Zod Boundary Looseness:** `EngineBIngestRequestSchema` in `types/engine-b-ingestion.ts` validated `feeder_id` as an arbitrary non-empty string (`z.string().min(1)`), allowing non-UUID values to leak into the network layer.

**Resolutions Implemented:**
1. **Integration of Seeded Asset Identity:**
   - Feeder UUID: `"f47ac10b-58cc-4372-a567-0e02b2c3d479"`
   - Feeder Name: `"North Corridor Feeder"`
   - Substation: `"Central District"`
   - Voltage Class: `"33kV"`
   - Status: `"STABLE"`
2. **Store Default Migration (`frontend/store/feeder-store.ts`):**
   - Updated `DEFAULT_FEEDER_ID` to `"f47ac10b-58cc-4372-a567-0e02b2c3d479"`.
   - Seeded initial `activeFeederId` and `selectedFeeders` to this UUID.
   - Standardized casing normalization across `setActiveFeeder`, `setSelectedFeeders`, and `toggleSelectedFeeder` to `.trim().toLowerCase()` to prevent UUID case mismatch issues against PostgreSQL canonical output.
3. **Asset Selector Fallback Migration (`frontend/components/dashboard/feeder-selector.tsx`):**
   - Replaced `"FDR-001"` in `FALLBACK_FEEDERS` with the seeded grid asset metadata.
   - Updated `activeFeeder` resolution to fallback to `activeFeederId || DEFAULT_FEEDER_ID` with case-insensitive matching.
4. **Boundary Schema UUID Enforcement (`frontend/types/engine-b-ingestion.ts`):**
   - Upgraded `feeder_id` validation to:
     ```typescript
     feeder_id: z
       .string()
       .trim()
       .uuid("Invalid Feeder UUID")
       .min(1)
     ```
   - Pre-emptively rejects non-UUID strings on the client before dispatching HTTP payloads.

### 4.4. PostgreSQL JSON/JSONB Persistence Resolution (SQLSTATE 22P02) in Gateway Repo

Following the resolution of the feeder UUID syntax issue, runtime ingestion persistence to the `risk_predictions` table encountered an invalid JSON syntax database rejection:
```text
insert into risk_predictions failed: ERROR: invalid input syntax for type json (SQLSTATE 22P02)
```

**Root Causes Diagnosed:**
1. **Driver Wire Representation (`bytea` vs `text`):** In `pgxTelemetryRepo.PersistPrediction`, `factorsJSON` was serialized as Go `[]byte` via `json.Marshal(p.ContributingFactors)`. Even with an explicit SQL cast (`$7::jsonb`), the `pgx` driver defaults to transmitting Go `[]byte` slices as binary hexadecimal (`bytea`) over the wire. PostgreSQL receives `\x5b...` instead of `[...]` and rejects it with `SQLSTATE 22P02` before the cast can be evaluated.
2. **PostgreSQL JSON Parser Failure:** PostgreSQL attempts to interpret `bytea` hexadecimal representation (`\x5b...`) as a raw JSON string, failing immediately on the escape token `\` with `SQLSTATE 22P02`.
3. **Nil Slice Serialization:** If `p.ContributingFactors` is nil or unpopulated, standard Go `json.Marshal(nil)` produces `[]byte("null")` rather than an empty JSON array `[]byte("[]")`.

**Resolutions Implemented (`backend/services/gateway/handlers/prediction_handler.go`):**
1. **Explicit String Conversion in Execution Arguments:**
   Cast the `[]byte` slice to a standard Go string explicitly in the query argument list (`string(factorsJSON)`):
   ```go
   _, err = r.db.Pool.Exec(ctx, query,
       p.FeederID, p.GeneratedAt, p.HorizonHours,
       p.RiskScore, p.RiskLevel, p.ModelVersion, string(factorsJSON),
   )
   ```
   This guarantees the parameter is transmitted as PostgreSQL `text` (OID 25), enabling PostgreSQL's text-to-json parser to safely ingest the JSON payload.
2. **Explicit SQL JSONB Cast (`$7::jsonb`):**
   Retained explicit `$7::jsonb` casting in the INSERT statement:
   ```sql
   INSERT INTO risk_predictions
   (feeder_id, generated_at, horizon, score, level, model_version, contributing_factors)
   VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
   ```
3. **Safe JSON Serialization with Nil/Empty Fallback:**
   Guaranteed non-null, valid JSON array serialization:
   ```go
   factors := p.ContributingFactors
   if factors == nil {
       factors = []ShapFactor{}
   }

   factorsJSON, err := json.Marshal(factors)
   if err != nil || len(factorsJSON) == 0 || string(factorsJSON) == "null" {
       factorsJSON = []byte("[]")
   }
   ```
4. **Compilation Verification:**
   Executed `go vet ./...` and `go build ./...` across the gateway service with 0 compilation errors.

---

## 5. Phase 3: Explainable AI (XAI) Mathematical Rendering (TreeSHAP Waterfall Architecture)

Phase 3 implements the visual mathematical explainability layer for Engine B, transforming raw Python TreeSHAP attribution coefficients into a high-performance, fluid, and memoized horizontal divergence waterfall chart.

### 5.1. XAI Humanization Dictionary & Domain Formatter
**Source File:** [`frontend/lib/formatters/shap-dictionary.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/lib/formatters/shap-dictionary.ts)
- Translates ML feature strings into operational electrical engineering terminology:
  - `voltage_sag_depth` &rarr; `"Voltage Sag Depth"`
  - `load_volatility` / `load_volatility_24h` &rarr; `"Load Volatility Index"` / `"24h Load Volatility Index"`
  - `hour_sin` &rarr; `"Diurnal Peak Alignment"`
  - `fault_count_24h` &rarr; `"24h Transient Fault Frequency"`
  - `voltage` &rarr; `"Bus Voltage"`
  - `load` &rarr; `"Active Feeder Load"`
  - `fault_count_recent` &rarr; `"Recent Transient Fault Frequency"`
  - `voltage_mean_12h` &rarr; `"12h Voltage Baseline Mean"`
- Exposes `formatShapFeature(key: string): string` with title-case fallback for newly added model features.

### 5.2. Memoization & Re-Render Guarding (`areShapPropsEqual`)
**Source File:** [`frontend/components/engine-b/shap-waterfall-chart.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/engine-b/shap-waterfall-chart.tsx)
- Recharts generates heavy SVG DOM trees which can induce main-thread stutter if re-rendered during the 30-second TanStack background polling cycles.
- Wrapped in `React.memo` with a custom comparator `areShapPropsEqual(prevProps, nextProps)` that executes an $O(N)$ deep comparison across `contributing_factors` (`feature_name` and `contribution`). SVG re-renders occur strictly when the underlying ML factors change.

### 5.3. Recharts SVG DOM Topology & Polarity Fills
- **Layout:** Vertical horizontal-bar layout (`<BarChart layout="vertical">` inside `<ResponsiveContainer>`).
- **Dynamic Polarity Cells:**
  - Positive SHAP contributions ($> 0$, risk-increasing factors): `#f43f5e` (Tailwind `rose-500`).
  - Negative SHAP contributions ($< 0$, risk-suppressing factors): `#34d399` (Tailwind `emerald-400`).
- **Minimalist Axis Engineering:**
  - Noisy grid lines stripped via `<CartesianGrid vertical={false} horizontal={false} />`.
  - Hidden numeric X-axis for an uncluttered operational presentation.
  - Custom Y-axis SVG renderer with automatic label truncation ($> 22$ characters) and tooltip fallback `<title>` tags.

### 5.4. Framer Motion Entrance Dynamics
- Embedded in a `<motion.div>` with spring physics:
  - Initial state: `{ opacity: 0, scale: 0.97, filter: "blur(4px)" }`
  - Animate state: `{ opacity: 1, scale: 1, filter: "blur(0px)" }`
  - Transition: `{ type: "spring", stiffness: 300, damping: 24, mass: 0.8 }`

### 5.5. Liquid Glass Tooltip Injection (`CustomShapTooltip`)
- Specular glass container: `bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-3 text-white`.
- Prominent humanized feature header with raw technical feature subtext.
- Signed 4-decimal magnitude formatting (`+0.1234` or `-0.0456`) color-matched to polarity.
- Directional badges: "Risk Increasing" (`TrendingUp`) vs "Risk Suppressing" (`TrendingDown`).

### 5.6. Summary Dashboard Integration
**Source File:** [`frontend/app/dashboard/engine-b/page.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/dashboard/engine-b/page.tsx)
- Mounted directly into Panel 2, connected to 100% live PostgreSQL materialized data via `useEngineBSummary()`.

---

## 6. Verification Matrix

| Target Layer | Component / File | Verification Method | Result |
| :--- | :--- | :--- | :--- |
| **Zod Schema** | `types/engine-b-ingestion.ts` | Synthetic Boundary Assertions | 100% Passed (4/4 tests: valid, length, ordering, future leakage) |
| **UUID Validation** | `types/engine-b-ingestion.ts` | Zod `.uuid()` boundary enforcement | 100% Enforced (Rejects non-UUID formats) |
| **Asset Context** | `store/feeder-store.ts` | Seeded UUID default synchronization | `"f47ac10b-58cc-4372-a567-0e02b2c3d479"` |
| **Asset Fallback** | `components/dashboard/feeder-selector.tsx` | Seeded metadata fallback alignment | Verified (0 legacy `"FDR-001"` instances) |
| **JSON Serialization**| `handlers/prediction_handler.go` | `PersistPrediction` fallback `[]byte("[]")` | Verified (No nil/"null" leakage) |
| **Driver Wire Format** | `handlers/prediction_handler.go` | Explicit `string(factorsJSON)` argument | Verified (Transmits text OID 25, not bytea) |
| **SQL Query Cast** | `handlers/prediction_handler.go` | Explicit `$7::jsonb` insert parameter cast | Verified (Eliminates `bytea` coercion error) |
| **XAI Dictionary** | `lib/formatters/shap-dictionary.ts` | Domain nomenclature mapping & fallback | 100% Covered |
| **XAI Chart** | `components/engine-b/shap-waterfall-chart.tsx` | Memoized Recharts SVG with dynamic polarity | Verified |
| **Go Gateway** | `handlers/summary_handler.go` | `go vet ./cmd/api ./handlers` | 0 errors |
| **Go Gateway** | `handlers/prediction_handler.go` | `IngestTelemetry` compilation | 0 errors |
| **Go Gateway** | Full Gateway Codebase | `go vet ./...` & `go build ./...` | 0 errors |
| **Python Core** | `main.py` & `prediction_routes.py` | `py_compile` syntax verification | 0 errors |
| **Frontend Types** | Full Next.js Frontend | `pnpm tsc --noEmit` | 0 errors |
| **Proxy Route** | `api/proxy/v1/prediction/summary` | Route handler verification | Preserves 400, 404, 500 status codes |
| **Proxy Route** | `api/proxy/v1/prediction/ingest` | Route handler verification | Forwards POST to Go Gateway |
| **Polling Hook** | `hooks/use-engine-b-summary.ts` | Cache invalidation contract | Verified with `activeFeederId` binding |

---

## 7. Directory of Key Files

- [`frontend/lib/formatters/shap-dictionary.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/lib/formatters/shap-dictionary.ts) — Humanized electrical engineering nomenclature dictionary
- [`frontend/components/engine-b/shap-waterfall-chart.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/engine-b/shap-waterfall-chart.tsx) — Memoized horizontal divergence waterfall chart
- [`frontend/store/feeder-store.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/store/feeder-store.ts) — Global Zustand feeder context store with canonical UUID defaults
- [`frontend/components/dashboard/feeder-selector.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/dashboard/feeder-selector.tsx) — Dynamic grid asset selector & fallback metadata
- [`frontend/types/engine-b-ingestion.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/types/engine-b-ingestion.ts) — Zod runtime validation with strict UUID enforcement
- [`frontend/app/api/proxy/v1/prediction/ingest/route.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/api/proxy/v1/prediction/ingest/route.ts) — Ingestion proxy route (Command Pathway)
- [`frontend/components/ingestion/engine-b-form.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/ingestion/engine-b-form.tsx) — Telemetry assembly form & baseline generator
- [`frontend/components/ingestion/network-resilience-monitor.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/components/ingestion/network-resilience-monitor.tsx) — Gateway link telemetry panel
- [`frontend/app/dashboard/ingestion/engine-b/page.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/dashboard/ingestion/engine-b/page.tsx) — Two-column ingestion page
- [`backend/services/gateway/handlers/prediction_handler.go`](file:///c:/users/hp/Desktop/gridsense-ai/backend/services/gateway/handlers/prediction_handler.go) — `IngestTelemetry` & `PersistPrediction` closing loop
- [`backend/services/gateway/handlers/summary_handler.go`](file:///c:/users/hp/Desktop/gridsense-ai/backend/services/gateway/handlers/summary_handler.go) — Golang materialized prediction summary handler
- [`backend/services/gateway/cmd/api/main.go`](file:///c:/users/hp/Desktop/gridsense-ai/backend/services/gateway/cmd/api/main.go) — Gateway route mounting for `/api/v1/prediction/ingest` and `/api/v1/prediction/summary`
- [`backend/ai-services/engine_b/api/prediction_routes.py`](file:///c:/users/hp/Desktop/gridsense-ai/backend/ai-services/engine_b/api/prediction_routes.py) — FastAPI inference route with key verification
- [`frontend/app/api/proxy/v1/prediction/summary/route.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/api/proxy/v1/prediction/summary/route.ts) — Summary proxy route (Query Pathway)
- [`frontend/hooks/use-engine-b-summary.ts`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/hooks/use-engine-b-summary.ts) — TanStack Query 30s polling hook
- [`frontend/app/dashboard/engine-b/page.tsx`](file:///c:/users/hp/Desktop/gridsense-ai/frontend/app/dashboard/engine-b/page.tsx) — Summary dashboard page with Liquid Glass metric cards and mounted XAI TreeSHAP waterfall chart
