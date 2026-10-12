# GridSense AI: Engine A Complete Architectural Summary & Engineering Retrospective

**Intelligence Engine A: Grid Feeder Reliability & 24-Hour Evaluation Architecture**  
**Lead Systems Architecture & API Integration Group**  
**Document Classification:** Definitive Engineering Standard  
**Revision:** 3.0.0

---

## 1. Executive Overview & System Mandate

**Intelligence Engine A** is the foundational reliability assessment engine of the GridSense AI platform. Its primary objective is to evaluate electrical feeders and grid assets across a rolling 24-hour cycle, deterministically calculating an asset's **Reliability Health Index ($0.0 - 100.0$)**, determining its operational stability category (**STABLE**, **VULNERABLE**, or **HIGH_RISK**), and generating time-series trend projections.

Over Phases 3 through 6, Engine A underwent an enterprise-grade architectural overhaul: resolving temporal alignment discrepancies in the Python AI core, establishing an atomic transactional ingestion pipeline in the Go API Gateway, enforcing a strict Command Query Responsibility Segregation (CQRS) REST pattern, and delivering an off-white **Liquid Glass** operator interface in Next.js 16.

---

## 2. The CQRS Architectural Paradigm (Ingestion vs. Visualization)

Per the Architectural Decision Record ([CQRS_Engine_Integration_Standard.md](file:///c:/users/hp/Desktop/gridsense-ai/docs/architecture/CQRS_Engine_Integration_Standard.md)), Engine A established the immutable blueprint governing all subsequent engines (Engines B, C, and D):

```
+---------------------------------------------------------------------------------+
|                                 CQRS TOPOLOGY                                   |
|                                                                                 |
|  COMMAND PATHWAY (Telemetry Ingestion)                                          |
|  Next.js Page: `/dashboard/ingestion/engine-a`                                  |
|       │                                                                         |
|       ▼ HTTP POST (fetch)                                                       |
|  Next.js Proxy: `/api/proxy/v1/reliability/ingest`                              |
|       │                                                                         |
|       ▼ Bearer JWT + 1MB Body Cap                                               |
|  Go API Gateway: `handlers/reliability.go` (Ingest Handler)                     |
|       ├──► Dispatches to Python Engine A (`core/aligner.py`)                    |
|       └──► PostgreSQL Atomic Transaction (`pg_advisory_xact_lock(1337)`)         |
|                                                                                 |
|  QUERY PATHWAY (Dashboard & Visualization)                                       |
|  Next.js Page: `/dashboard/engine-a`                                            |
|       │                                                                         |
|       ▼ HTTP GET (TanStack Query)                                               |
|  Next.js Proxy: `/api/proxy/v1/...`                                             |
|       ├── `/api/proxy/v1/reliability/summary`                                   |
|       ├── `/api/proxy/v1/priorities`                                            |
|       └── `/api/proxy/v1/reliability/trend?timeRange=24h|7d|30d`               |
|       │                                                                         |
|       ▼ Forward Cookie / Bearer                                                 |
|  Go API Gateway: `handlers/dashboard_handler.go` & `dashboard_repo.go`          |
|       └──► Reads directly from PostgreSQL materialized tables                   |
|            (Completely bypasses live Python execution during reads)             |
+---------------------------------------------------------------------------------+
```

### Core Tenets of the CQRS Pattern:
1. **Bypassing the GraphQL BFF for Engine Dashboards:** The GraphQL Backend-for-Frontend is reserved strictly for high-level overview metrics and WebSocket subscriptions. Standalone intelligence engine views operate exclusively via direct REST CQRS proxy routes (`/api/proxy/v1/...`).
2. **Zero Python Execution on Visualization Reads:** The dashboard never invokes the Python microservice to render summaries. All data is read from pre-calculated materialized tables (`grid_assets`, `risk_history`) in PostgreSQL.
3. **Decoupled Interfaces:** Telemetry ingestion interfaces and intelligence summary dashboards are physically separated onto distinct pages.

---

## 3. Python AI Engine: The Scoring Window Alignment Resolution

### The Temporal Boundary Problem
In `backend/ai-services/engine_a/core/aligner.py`, the 24-hour evaluation window was initially defined forward:
$$\text{Window} = [\text{cycle\_timestamp}, \text{cycle\_timestamp} + 24\text{h}]$$

However, Go Gateway validation strictly required interruption `start_time` to occur in the trailing 24 hours *preceding* the cycle:
$$\text{Validation Bounds} = [\text{cycle\_timestamp} - 24\text{h}, \text{cycle\_timestamp}]$$

Because all valid historical outages occurred before `cycle_timestamp`, the Python aligner discarded every interruption record as out-of-bounds. As a result, feeders with extensive outages erroneously calculated perfect reliability scores ($100.0$).

### The Architectural Resolution
1. **Window Alignment:** Shifted the evaluation window in `aligner.py` to evaluate the 24 hours ending at `cycle_timestamp`:
   $$\text{cycle\_start} = \text{cycle\_timestamp} - 1439\text{ minutes}$$
   $$\text{cycle\_end} = \text{cycle\_timestamp}$$
2. **Clipping Logic:** Outages that began prior to `cycle_start` or extended past `cycle_end` are cleanly clipped to the active 24-hour window boundaries.
3. **Deterministic Mathematical Verification:** Verified calculations across 17 test cycles for feeders `FDR-001` through `FDR-005`:
   - `FDR-001`: $100.0$ (`STABLE`)
   - `FDR-002`: $95.0$ (`STABLE`)
   - `FDR-003`: $75.0$ (`VULNERABLE`)
   - `FDR-004`: $25.0$ (`HIGH_RISK`)
   - `FDR-005`: Tracked expected historical progression ($100.0 \rightarrow 93.0 \rightarrow 81.0 \rightarrow 25.0$).

---

## 4. Go API Gateway & Data Persistence Layer

### 4.1 Ingestion Pipeline (`backend/services/gateway/handlers/reliability.go`)
- **Payload Limits & Defense:** Enforces a 1 MB body cap via `http.MaxBytesReader`, maximum 6 interruption records per cycle, maximum 720 minutes per individual outage, and maximum 1440 minutes aggregate interruption duration.
- **Timestamp & Decimal Normalization:** Normalizes all incoming timestamps (`CycleTimestamp`, `StartTime`) explicitly to UTC, and applies strict 2-decimal rounding via `Round2Dec` on capacities, durations, and scores.
- **Atomic PostgreSQL Transactions:** Wrapped database ingestion in an atomic transaction utilizing a static transaction-level advisory lock (`pg_advisory_xact_lock(1337)`) to serialize rank recomputation and prevent race conditions.

### 4.2 Database Schema Migration (`20261008000000_risk_history.sql`)
Resolved HTTP 500 internal errors by creating and migrating the `risk_history` table:
```sql
CREATE TABLE IF NOT EXISTS risk_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    area_id VARCHAR(255) NOT NULL,
    risk_value NUMERIC(5,2) NOT NULL,
    recorded_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT fk_grid_assets FOREIGN KEY (area_id) REFERENCES grid_assets(id) ON DELETE CASCADE,
    CONSTRAINT uq_risk_history UNIQUE (area_id, recorded_at)
);

COMMENT ON COLUMN risk_history.risk_value IS 'reliability score 0-100, higher = healthier';
CREATE INDEX IF NOT EXISTS idx_risk_history_recorded_at ON risk_history (recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_history_area_time ON risk_history (area_id, recorded_at DESC);
```

---

## 5. Security, Session Management & Authentication Hardening

### 5.1 Resolving 15-Minute Operator Logouts
- **Root Cause:** Go authentication issued access tokens with a 15-minute lifespan, while the `refresh_token` cookie was scoped to `Path: "/api/auth/refresh"`. Because Next.js proxied traffic through `/api/proxy/...`, browser cookie path scoping prevented the refresh cookie from being sent.
- **Resolution:** Re-scoped refresh cookies to `Path: "/api/proxy"`, wired an explicit refresh handler in the Go auth service, and implemented proxy-side proactive token rotation.

### 5.2 Single-Flight Request Deduplication
- Implemented single-flight request coalescing (`pendingRefreshes` map in `frontend/app/api/proxy/[...slug]/route.ts`). When an access token expires, multiple concurrent requests coalesce into a single refresh request upstream, replaying queued requests without stampeding token invalidations.

---

## 6. Frontend Architecture & User Experience (Phases 3 - 6)

### 6.1 "Liquid Glass" Design Philosophy
The application strictly avoids dark mode in favor of an off-white Liquid Glass canvas:
- **Palette:** Off-White `#F8FAF8` canvas accented by Emerald Green (`#10b981`) for stable indicators, Amber (`#f59e0b`) for warnings, and Crimson (`#ef4444`) for high-risk assets.
- **Glass Effects:** `backdrop-blur-md`, subtle specular edge highlights (inner border rendering `shadow-[inset_0_1px_1px_rgba(255,255,255,0.8)]`), and soft drop shadows to simulate physical glass.

### 6.2 Core Standalone Dashboard (`/dashboard/engine-a`)
- **KPI Summary Cards (`summary-cards.tsx`):** Real-time aggregation of system-wide reliability metrics, high-risk area counts, and active alert counters.
- **Priority Areas Decision Table (`priority-table.tsx`):**
  - *Status Case Alignment:* Normalized backend uppercase strings (`"STABLE"`, `"VULNERABLE"`, `"HIGH_RISK"`), eliminating a bug where healthy feeders defaulted to red warning badges.
  - *Metric Polarity Alignment:* Corrected color thresholds to reflect that Engine A is a health index ($100 = \text{healthy}$), mapping `STABLE` to Emerald `#10b981` and `HIGH_RISK` to Red `#ef4444`.
- **Reliability Trend Chart (`reliability-trend.tsx`):**
  - *Time Range Toggling:* Added dynamic state toggles for `24h`, `7d`, and `30d`.
  - *Recharts Enhancements:* Chronological oldest-to-newest sorting (`useMemo`), dot markers (`dot={{ r: 4, fill: '#10b981' }}`), and an informational pill `"Not enough history in this range"` when $< 2$ points exist.

### 6.3 Dedicated Telemetry Ingestion Page (`/dashboard/ingestion/engine-a`)
- **Form Architecture (`engine-a-form.tsx`):**
  - Built with React Hook Form, `useFieldArray`, and Zod resolver.
  - Enforces client-side temporal boundaries (disallowing future timestamps and requiring outage start times within 24h before cycle timestamp).
  - Automatically converts local datetime inputs to normalized UTC strings.
- **Cache Invalidation:** On successful mutation, invalidates TanStack Query keys `["dashboard-metrics"]`, `["priority-areas"]`, and `["reliability-trend"]` for zero-latency dashboard synchronization.

### 6.4 Detail Drill-Down (`/dashboard/engine-a/[id]`)
- **Next.js 16 App Router Compatibility:** Asynchronous parameter unwrapping via React's `use()` hook (`const unwrappedParams = use(params)`).
- **Anomaly Timeline (`anomaly-timeline.tsx`):** Vertical timeline with interactive Liquid Glass droplet dots and smooth hover-expanded tooltips.
- **Predictive Forecast (`predictive-forecast.tsx`):** 6-hour forward-looking time-series chart with Recharts, enhanced with native SVG `<filter>` tags dynamically casting a glowing drop-shadow under the forecasted curve. Client-rendered via `next/dynamic` (`ssr: false`) to eliminate SSR hydration mismatches.
- **SHAP Feature Attribution (`intelligence-insight-panel.tsx`):** Sleek horizontal Liquid Glass progress bars visualizing feature attribution deviations.
- **Optimistic UI Interventions:** Direct operator intervention actions with TanStack Query's `onMutate` cache snapshots and graceful rollback handling.

### 6.5 Root Layout Provider Hardening
- **"No QueryClient Set" Bug Resolution:** Moved `QueryClientProvider` out of nested layouts into the root layout (`frontend/app/layout.tsx`), ensuring sibling routes (such as `/areas/[id]`) share the global query cache without unmounted client runtime exceptions.

---

## 7. Master Problem Catalog & Resolutions for Engine A

| # | Symptom | Root Cause | Engineering Resolution |
| :- | :--- | :--- | :--- |
| **1** | Interrupted feeders scored 100.0 | Forward 24h evaluation window in `aligner.py` discarded past outages | Shifted scoring window backward to trailing 24h with clipping |
| **2** | HTTP 500 error on telemetry ingest | Missing `risk_history` table in PostgreSQL | Created database migration `20261008000000_risk_history.sql` |
| **3** | Operators logged out every 15 min | Cookie path mismatch (`Path: "/api/auth/refresh"` vs `/api/proxy`) | Re-scoped cookie path to `/api/proxy` and wired backend refresh handler |
| **4** | Concurrent refresh race conditions | Client-side `sessionStorage` token management stampeding on expiry | Migrated to HttpOnly cookies and proxy-side single-flight coalescing |
| **5** | Stable feeders rendered in red | Case mismatch (`"STABLE"` vs `"Stable"`) & inverted polarity assumption | Implemented case-insensitive mapping and status-derived styling |
| **6** | Trend chart showed a single dot | Query hardcoded to `"24h"` with only 1 daily evaluation point | Added `24h`/`7d`/`30d` range selector with chronological sorting |
| **7** | Area page crashed on load | `QueryProvider` scoped only to `/dashboard/layout.tsx` | Moved `QueryProvider` to root `app/layout.tsx` |
| **8** | Unnecessary schema divergence | Protobuf/gRPC changes introduced for a page fetching via REST CQRS | Reverted gRPC/proto changes to maintain architectural uniformity |

---

## 8. Verification & Current Health Status

All Engine A components and services are verified and operational:
- **Go Gateway Compilation:** `go build ./...` passes with code `0`.
- **Frontend TypeScript Build:** `pnpm tsc --noEmit` passes with code `0`.
- **Next.js Turbopack Dev Server:** Operational and serving live telemetry.
- **Database Consistency:** Advisory locks and schema relationships active and verified.
