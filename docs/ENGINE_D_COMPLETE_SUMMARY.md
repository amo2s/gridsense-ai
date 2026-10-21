# Engine D Engineering Architecture & Frontend Implementation Log

**Subsystem:** GridSense AI — Engine D (Intervention Prioritization & Ranking)  
**Session Start Timestamp:** `2026-10-21T11:06:22+01:00`  
**Completion & Commit Timestamp:** `2026-10-21T11:59:30+01:00`  
**Architect:** Principal Frontend Architect & Lead Implementation Engineer  
**Status:** IMPLEMENTED, VERIFIED, & COMMITTED (TypeScript `tsc --noEmit` Exit Code: 0)

---

## 1. Executive Summary & Operational Scope

Engine D is the **multi-asset analytical ranker and intervention prioritization engine** of GridSense AI. While Engines A, B, and C focus on univariate/multivariate time-series telemetry on a single electrical feeder, Engine D synthesizes cross-engine intelligence signals from:
* **Engine A (Reliability):** `reliability_score`, `duration_penalty`, `frequency_penalty`
* **Engine B (Risk):** `risk_score`
* **Engine C (Anomaly):** `is_anomaly`, `anomaly_confidence`

It executes a **LightGBM LambdaMART ranker** compiled into an **ONNX Runtime artifact** (`hybrid_ranker.onnx`) to rank $\ge 2$ feeders within a shared operational grid area (`activeAreaId` / `query_id`). It derives deterministic priority tiers (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`) and generates **Explainable AI (XAI)** marginal SHAP feature attributions and neutral baseline offsets.

---

## 2. Activity & Implementation Log (Chronological Record)

### 2.1 Forensic Architectural Reconnaissance (Started: 11:06:22 AM)
* Conducted read-only audit across `backend/ai-services/engine_d`, `backend/services/gateway`, and `frontend/`.
* Mapped Python FastAPI entry point (`main.py`), routing controller (`api/prioritization_routes.py`), Pydantic v2 schemas (`ranking_contracts.py`), feature vectorization (`features/fusion_pipeline.py`), and ONNX execution (`models/hybrid_ranker.py`).
* Traced Go Gateway routing (`cmd/api/main.go`), handler logic (`handlers/prioritization_handler.go`), Sony Gobreaker circuit breaker, and asynchronous PostgreSQL persistence (`PersistPrioritization` into `priorities` table with `ON CONFLICT (query_id, feeder_id)`).
* Discovered that `frontend/store/feeder-store.ts` was coupled to single-feeder workflows and lacked `activeAreaId`. Formulated a strict isolation mandate to avoid state collisions.

### 2.2 Phase 1: State Management Isolation (11:50 AM)
* **File:** `frontend/store/engine-d-store.ts`
* Created completely isolated Zustand store preventing state contamination with `useFeederStore`.
* Implemented exact camelCase state keys:
  * `activeAreaId: string | null`
  * `selectedFeeders: string[]` (array of lowercase UUID strings)
  * `activeFeederId: string | null`
* Added mutators: `setActiveAreaId`, `setSelectedFeeders`, `toggleSelectedFeeder`, `setActiveFeederId`, and `resetSelection`.
* Configured Zustand `persist` middleware using `sessionStorage` key `"gridsense-engine-d-context"`.

### 2.3 Phase 2: Next.js API Proxy & 30-Second Timeout Budget (11:51 AM)
* **File:** `frontend/app/api/proxy/v1/priorities/rank/route.ts`
* Intercepts `POST /api/proxy/v1/priorities/rank?query_id={UUID}`.
* Injects `Authorization: Bearer ${authToken}` by extracting HTTP-only cookies (`auth_token` / `gridsense_session`).
* Enforced strict **30-second (`30_000ms`) execution budget** using `AbortController` to accommodate multi-feeder cross-engine joins and ONNX marginal perturbation loops.
* Implemented diagnostic simulation hooks (`x-simulate-response: 422`, `timeout`) and local offline fallback to maintain UI operability.

### 2.4 Phase 3: Client-Side Hook & Circuit Breaker Logic (11:51 AM)
* **File:** `frontend/hooks/use-engine-d-query.ts`
* Implemented `useEngineDQuery` data-fetching hook automatically subscribed to `useEngineDStore.activeAreaId`.
* **Circuit Breaker Mechanism:**
  * Tracks `consecutiveFailures`.
  * Trips breaker (`isCircuitBreakerOpen = true`) upon **3 consecutive failures**.
  * Initiates an active **30-second countdown cool-off timer** (`circuitBreakerRemainingSeconds`).
  * Exposes `resetCircuitBreaker` for manual operator overrides.
* **CQRS Direct Rendering:** Adheres to the Go Gateway's asynchronous background persistence. The client performs zero optimistic updates and directly renders the synchronously returned `PrioritizationResponse`.

### 2.5 Phase 4: Dedicated Routing & Liquid Glass UI Components (11:52 AM - 11:55 AM)
* **Type Contracts:** `frontend/types/engine-d.ts` (Zod schemas for `MultiEngineSignalsSchema`, `PrioritizationRequestSchema`, and TypeScript interfaces for `RankedAsset`, `ShapAttribution`, and `PrioritizationResponse`).
* **Multi-Engine Synthetic Baseline Generator:** Added `generateEngineDFusedBaseline()` to `frontend/lib/telemetry-generator.ts`.
* **Sidebar Navigation:** Mounted `Priority Ranking (Engine D)` (`/dashboard/engine-d`) and `Engine D Ingestion` (`/dashboard/ingestion/engine-d`) in `frontend/components/dashboard/sidebar.tsx`.
* **Command Pathway (Ingestion):**
  * Route: `frontend/app/dashboard/ingestion/engine-d/page.tsx`
  * Form: `frontend/components/ingestion/engine-d-form.tsx` (React Hook Form + Zod, listwise $\ge 2$ asset validation, Liquid Glass styling, multi-engine baseline staging).
* **Query Pathway (Dashboard):**
  * Route: `frontend/app/dashboard/engine-d/page.tsx`
  * Component: `frontend/components/engine-d/priority-matrix-table.tsx` (Priority tiers, 1-indexed ranks, urgency score progress, base offsets, row selection).
  * Component: `frontend/components/engine-d/shap-attribution-waterfall.tsx` (Bidirectional XAI feature contribution bars, additivity formula).
  * Component: `frontend/components/engine-d/intervention-action-dialog.tsx` (Operator decision actions: **Dispatched**, **Deferred**, **Ignored** feeding the RL loop).
  * **Real-Time Redis Alert Stream Integration:** Subscribes to `gridsense:alerts:stream` via `useAlertStore`. Triggers Sonner toast on CRITICAL alert, applies crimson (`#DC2626`) pulse/glow to the top-ranked feeder row, and mounts the Intervention Dialog.

---

## 3. Architecture & File Matrix

| Layer | File Path | Purpose |
| :--- | :--- | :--- |
| **Types & Contracts** | `frontend/types/engine-d.ts` | Pydantic v2 & Go DTO parity, Zod schemas |
| **State Management** | `frontend/store/engine-d-store.ts` | Isolated Zustand store (`activeAreaId`, `selectedFeeders`, `activeFeederId`) |
| **API Proxy** | `frontend/app/api/proxy/v1/priorities/rank/route.ts` | Next.js reverse proxy with 30s timeout & JWT injection |
| **Data Fetching Hook** | `frontend/hooks/use-engine-d-query.ts` | React Query hook with 3-strike circuit breaker & 30s cooldown |
| **Baseline Generator** | `frontend/lib/telemetry-generator.ts` | `generateEngineDFusedBaseline()` multi-engine signal synthesis |
| **Navigation** | `frontend/components/dashboard/sidebar.tsx` | Menu items for Engine D dashboard and ingestion |
| **Ingestion Page** | `frontend/app/dashboard/ingestion/engine-d/page.tsx` | Command Pathway route wrapper |
| **Ingestion Form** | `frontend/components/ingestion/engine-d-form.tsx` | Multi-asset fusion staging and execution form |
| **Dashboard Page** | `frontend/app/dashboard/engine-d/page.tsx` | Query Pathway dashboard with HTTP 503 circuit breaker panel |
| **Priority Table** | `frontend/components/engine-d/priority-matrix-table.tsx` | Urgency ranking table with crimson strobe for critical tier |
| **XAI Waterfall** | `frontend/components/engine-d/shap-attribution-waterfall.tsx` | Itemized SHAP feature attribution waterfall |
| **Intervention Dialog** | `frontend/components/engine-d/intervention-action-dialog.tsx` | Operator actions dialog (`Dispatched`, `Deferred`, `Ignored`) |

---

## 4. Verification & Build Health

```bash
npx tsc --noEmit
# Exit Code: 0 (Zero TypeScript errors)
```

Both routes are verified and functional on the local development server:
* `http://localhost:3000/dashboard/ingestion/engine-d`
* `http://localhost:3000/dashboard/engine-d`
