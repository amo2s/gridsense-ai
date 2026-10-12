# GridSense AI: Engineering Retrospective

---

## 1. Problem Catalog

### 1. Ingestion Endpoint Build (Validation, UTC Handling, Rounding, Transaction)
- **Symptom**: Operational telemetry data (assets, capacity, and power interruptions) lacked an atomic ingestion pipeline capable of validating payloads, computing reliability scores with Engine A, and persisting records consistently.
- **Root Cause**: The gateway lacked a dedicated `/api/v1/reliability/ingest` endpoint. Telemetry inputs had non-normalized timezones (local time vs. UTC), arbitrary floating-point precision, and uncoordinated updates across multiple tables (`assets`, `interruptions`, `grid_assets`, `risk_history`).
- **Fix**:
  - Implemented the `Ingest` handler in `backend/services/gateway/handlers/reliability.go`.
  - Enforced strict payload limits (1 MB body cap, max 6 interruptions, max 720 minutes per outage, max 1440 minutes total).
  - Normalized all incoming timestamps (`CycleTimestamp`, `StartTime`) explicitly to UTC.
  - Enforced 2-decimal rounding via `Round2Dec` on capacity, durations, and scores.
  - Wrapped database writes inside an atomic PostgreSQL transaction with a static transaction-level advisory lock (`pg_advisory_xact_lock(1337)`) to serialize rank recomputation.
- **Files / Layers Touched**:
  - Gateway Handlers: `backend/services/gateway/handlers/reliability.go`
  - Gateway Database: `backend/services/gateway/database/postgres.go`
  - Frontend Ingestion Form: `frontend/components/ingestion/engine-a-form.tsx`
- **How Confirmed**: Go compilation `go build ./...` in `backend/services/gateway` exited with code 0 (verified).

### 2. HTTP 500 Error on Ingest (Missing `risk_history` Table)
- **Symptom**: Telemetry ingestion requests failed with HTTP 500 (`"Internal database error during persistence"`).
- **Root Cause**: The ingestion transaction in `postgres.go` attempted to upsert into table `risk_history` (`INSERT INTO risk_history (area_id, risk_value, recorded_at)...`), but the table had not been defined or migrated in the database schema.
- **Fix**:
  - Created database migration `backend/database/supabase/migrations/20261008000000_risk_history.sql`.
  - Defined the `risk_history` table with columns `id UUID`, `area_id VARCHAR(255)`, `risk_value NUMERIC(5,2)`, `recorded_at TIMESTAMPTZ`, foreign key constraint `fk_grid_assets` referencing `grid_assets(id)` ON DELETE CASCADE, and a unique constraint on `(area_id, recorded_at)`.
- **Files / Layers Touched**:
  - Migrations: `backend/database/supabase/migrations/20261008000000_risk_history.sql`
  - Gateway DB: `backend/services/gateway/database/postgres.go`
- **How Confirmed**: Migration schema confirmed against foreign key relationships in `grid_assets`; SQL transaction syntax verified. Live execution against production database is UNSURE (live database access was prohibited).

### 3. Users Logged Out Every ~15 Minutes (Refresh Cookie Path Mismatch & Stale Token)
- **Symptom**: Operators actively viewing the dashboard were abruptly logged out after roughly 15 minutes of activity.
- **Root Cause**:
  - The Go authentication service issued access tokens with a 15-minute lifespan.
  - The `refresh_token` HTTP cookie was scoped with `Path: "/api/auth/refresh"`.
  - The frontend Next.js application routed API requests through `/api/proxy/...`. Standard browser cookie path scoping prevented browsers from sending the `refresh_token` cookie on proxy requests.
  - The auth service had no handler wired up to handle refresh requests. Once the initial 15-minute access token expired, silent token renewal was impossible.
- **Fix**:
  - Added a `refresh` service and handler in Go auth service (`backend/services/auth/internal/auth/refresh/`).
  - Wired `/api/auth/refresh` into the auth HTTP router.
  - Re-scoped refresh cookies to `Path: "/api/proxy"` so Next.js proxy endpoints receive the cookie.
- **Files / Layers Touched**:
  - Auth Service: `backend/services/auth/internal/auth/refresh/handler.go`, `service.go`, `main.go`
  - Proxy Route: `frontend/app/api/proxy/[...slug]/route.ts`
- **How Confirmed**: Go compilation `go build ./...` across auth microservices passed (verified). Browser test scripts in `frontend/__tests__/helpers/auth.test.js` were temporary scaffolding and deleted in commit `7ff6bbb`; unverified in automated regression tests.

### 4. The Session Rewrite (httpOnly Cookies, Proxy-Side Refresh, Single-Flight)
- **Symptom**: Storing tokens in browser `sessionStorage` exposed tokens to JavaScript and failed to provide reliable background token rotation, causing race conditions when multiple concurrent requests attempted token refreshes.
- **Root Cause**: Next.js client code initially attempted to manage auth tokens in frontend storage instead of delegating cookie lifecycle management to the server/proxy edge. Concurrent API requests on token expiration triggered stampeding refresh calls that invalidated one another.
- **Fix**:
  - Rewrote `frontend/app/api/proxy/[...slug]/route.ts` to manage secure `httpOnly`, `sameSite: "lax"` cookies (`auth_token`, `refresh_token`).
  - Implemented proxy-side proactive token refresh if an access token expires within 60 seconds.
  - Implemented single-flight request coalescing using an in-memory `pendingRefreshes` map (`Map<string, Promise<...>>`) to ensure only one refresh request hits upstream, replaying queued requests with the new token.
- **Files / Layers Touched**:
  - API Proxy: `frontend/app/api/proxy/[...slug]/route.ts`
  - Client API Client: `frontend/src/lib/api.ts`
- **How Confirmed**: `npm run build` Turbopack production build compiled with exit code 0 (verified). Mock test suite was temporary scaffolding and deleted in commit `7ff6bbb`.

### 5. Login Spinner & Redirect Loop (Response Shape Mismatch, No Cookies Stored)
- **Symptom**: Entering valid credentials on the login form caused the submit button to spin indefinitely, or redirected the user to `/dashboard` and immediately kicked them back to the login page.
- **Root Cause**:
  - The login form expected `res.data.data.access_token`, but the upstream auth response envelope varied (`data.access_token` vs `data.data.access_token`).
  - The proxy was not intercepting the `/auth/login` response to set `auth_token` and `refresh_token` `Set-Cookie` headers.
  - When the client redirected to `/dashboard`, Next.js middleware (`frontend/proxy.ts`) saw no `auth_token` cookie and redirected straight back to `/portal?callbackUrl=/dashboard`.
- **Fix**:
  - Intercepted the `/api/proxy/auth/login` upstream response inside `route.ts`, extracting `access_token` and `refresh_token` from either envelope structure.
  - Set httpOnly `auth_token` (`Path: "/"`) and `refresh_token` (`Path: "/api/proxy"`) on the response.
  - Simplified `LoginForm` to check response success and verify session via `/api/proxy/auth/me`.
- **Files / Layers Touched**:
  - Proxy Route: `frontend/app/api/proxy/[...slug]/route.ts`
  - Login Component: `frontend/components/auth/login-form.tsx`
  - Auth Middleware: `frontend/proxy.ts`
- **How Confirmed**: `npm run build` compiled cleanly with exit code 0 (verified).

### 6. GraphQL 401 on the Dashboard
- **Symptom**: The main dashboard page (`/dashboard`) showed empty data cards and logged `GraphQL Fetch Error: ClientError: ... 401 Unauthorized` in server console logs.
- **Root Cause**: `frontend/app/dashboard/page.tsx` was originally an async Server Component attempting to invoke `getGraphQLClient()` server-side directly against the GraphQL backend without forwarding the user's browser session cookie.
- **Fix**:
  - Extracted dashboard visual components into a Client Component (`frontend/app/dashboard/dashboard-content.tsx`).
  - Migrated GraphQL calls to `frontend/lib/graphql-client.ts` pointing to `/api/proxy/query` with `credentials: 'same-origin'`.
  - The browser automatically attaches `auth_token`, and the proxy injects `Authorization: Bearer <token>` upstream.
- **Files / Layers Touched**:
  - Dashboard Pages: `frontend/app/dashboard/page.tsx`, `frontend/app/dashboard/dashboard-content.tsx`
  - Client Config: `frontend/lib/graphql-client.ts`
- **How Confirmed**: `npm run build` compiled without SSR hydration errors (verified).

### 7. Dashboard Color & Status Contradictions (Case Mismatch, Inverted Colors)
- **Symptom**: On the Engine A priority table (`/dashboard/engine-a`), all feeders rendered with red status badges and red/orange risk scores, even healthy feeders like `FDR-001` (score 100.0).
- **Root Cause**:
  - Status badge logic used `row.status === 'Stable'`. The Go backend exclusively outputs uppercase strings (`"STABLE"`, `"VULNERABLE"`, `"HIGH_RISK"`). Due to case mismatch, `"STABLE"` missed the check and fell through to the default red badge styling.
  - Score color logic used client-side numeric thresholds assuming higher scores meant higher risk (`score >= 80 ? red : score >= 50 ? amber : green`). In reality, GridSense scores are a 0–100 health index (higher = healthier; 100 is stable, 25 is high risk).
- **Fix**:
  - Implemented trimmed, case-insensitive comparison (`s === 'STABLE'`, `s === 'VULNERABLE'`, `s === 'HIGH_RISK'`, with neutral gray fallback for unknown values).
  - Removed numeric thresholds; derived score color directly from backend status (`STABLE` = emerald `#10b981`, `VULNERABLE` = amber `#f59e0b`, `HIGH_RISK` = red `#ef4444`).
- **Files / Layers Touched**:
  - Component: `frontend/components/engine-a/priority-table.tsx`
- **How Confirmed**: `pnpm tsc --noEmit` and `npx eslint components/engine-a/priority-table.tsx` passed with exit code 0 (verified).

### 8. The One-Dot Trend Chart (24h Hardcode) and Time Range Toggle
- **Symptom**: The reliability trend card on `/dashboard/engine-a` displayed a single, disconnected dot rather than a historical trend line.
- **Root Cause**:
  - The query hook hardcoded the parameter to `"24h"`. Because evaluation cycles run once per day, only one evaluation existed in the trailing 24 hours.
  - Recharts `AreaChart` renders no line between points when given only 1 data point, and dot markers were not explicitly enabled.
  - No UI control existed to select broader historical time ranges (`7d`, `30d`).
- **Fix**:
  - Added a React state toggle for `24h` / `7d` / `30d`, passing the selected range to `useReliabilityTrend(timeRange)` with query key `["reliability-trend", timeRange]`.
  - Sorted trend points chronologically oldest-to-newest (`useMemo`).
  - Enabled dot markers (`dot={{ r: 4, fill: '#10b981' }}`).
  - Displayed an informational pill `"Not enough history in this range"` when `< 2` data points exist.
- **Files / Layers Touched**:
  - Component: `frontend/components/engine-a/reliability-trend.tsx`
- **How Confirmed**: `pnpm tsc --noEmit`, ESLint, and Next.js Turbopack build `npm run build` passed with exit code 0 (verified).

### 9. Engine A Scoring Window Bug (Scored 24h After the Cycle, Not Before)
- **Symptom**: Ingesting outages that occurred prior to `cycle_timestamp` failed to decrement reliability scores in Engine A calculations (feeders with extensive outages still scored 100.0).
- **Root Cause**:
  - In `backend/ai-services/engine_a/core/aligner.py`, the 24-hour evaluation window was defined forward:
    `cycle_start = payload.cycle_timestamp`
    `cycle_end = cycle_start + timedelta(minutes=1439)`
  - The engine scored the 24 hours *after* `cycle_timestamp`.
  - However, gateway validation strictly required interruption `start_time` to occur in the 24 hours *before* `cycle_timestamp` (`minTime = cycle_timestamp - 24h` up to `cycle_timestamp`). Because all valid outages preceded `cycle_start`, the aligner discarded every outage record.
- **Fix**:
  - Shifted the evaluation window in `aligner.py` to the 24 hours ending at `cycle_timestamp`:
    `cycle_end = payload.cycle_timestamp`
    `cycle_start = cycle_end - timedelta(minutes=1439)`
  - Added clipping logic so outages extending past `cycle_end` are truncated at `cycle_end`.
- **Files / Layers Touched**:
  - AI Engine Core: `backend/ai-services/engine_a/core/aligner.py`
- **How Confirmed**: Verified via inline Python calculations on all 17 cycles across FDR-001..FDR-005: FDR-001 scored 100.0 (STABLE); FDR-002 scored 95.0 (STABLE); FDR-003 scored 75.0 (VULNERABLE); FDR-004 scored 25.0 (HIGH_RISK); and FDR-005 tracked the expected historical progression across dates: 100.0 (Oct 3), 93.0 (Oct 4), 81.0 (Oct 6), and 25.0 (Oct 8) (verified).

### 10. The GraphQL/Proto Detour and How It Was Reverted
- **Symptom**: Unnecessary codebase divergence and architectural bloat: changes were made to protobuf schemas, generated Go stubs, gqlgen schemas, BFF resolvers, and GraphQL queries to add `status`, `severity`, and `label` fields, even though Engine A operates strictly over REST CQRS endpoints (`/api/proxy/v1/...`).
- **Root Cause**: Premature effort to synchronize GraphQL and gRPC schemas for a page that did not consume them.
- **Fix**:
  - Reverted all modified proto, generated gRPC, gqlgen, and BFF resolver files to `origin/main`.
  - Deleted untracked temporary files (`definitions.json`, `sysconfig.go`).
  - Cleaned up dependency changes in `go.mod`, `go.sum`, and `go.work.sum`.
- **Files / Layers Touched**:
  - Protobuf & BFF: `gateway.proto`, `gateway.pb.go`, `gateway_grpc.pb.go`, `schema.graphqls`, `schema.resolvers.go`, `models_gen.go`, `generated.go`
  - Frontend GraphQL: `queries.ts`, `generated.ts`
  - Go Workspace: `dashboard-bff/go.mod`, `go.sum`, `backend/go.work.sum`
- **How Confirmed**: `go build ./...` passed in `dashboard-bff` (exit code 0), `go build ./...` passed in `gateway` (exit code 0), and `npx tsc --noEmit` passed in frontend (exit code 0) (verified).

### 11. "No QueryClient Set" Error on the Area Page
- **Symptom**: Clicking on a feeder to drill into `/areas/FDR-005` crashed immediately with a runtime error:
  `"No QueryClient set, use QueryClientProvider to set one" at app/areas/[id]/area-content.tsx:15`.
- **Root Cause**:
  - `QueryProvider` was mounted only inside `app/dashboard/layout.tsx`.
  - The route `/areas/[id]` is located outside `/dashboard` and inherits only `app/layout.tsx`.
  - Because `app/layout.tsx` had no `QueryClientProvider`, any TanStack React Query hook (`useQuery`, `useQueryClient`) in `/areas` threw an unbound client exception.
- **Fix**:
  - Mounted `QueryProvider` once in the root layout (`frontend/app/layout.tsx`), reading session tokens from cookies server-side.
  - Removed the duplicate `QueryProvider` from `frontend/app/dashboard/layout.tsx`, creating a single shared `QueryClient` that prevents cache resets during navigation.
- **Files / Layers Touched**:
  - Root Layout: `frontend/app/layout.tsx`
  - Dashboard Layout: `frontend/app/dashboard/layout.tsx`
- **How Confirmed**: `pnpm tsc --noEmit` (exit code 0), ESLint (exit code 0), and Next.js Turbopack build `npm run build` (exit code 0) (verified).

---

## 2. Architecture as It Is Now

| Page / Route | Data Path | Protocol | Backing Service |
| :--- | :--- | :--- | :--- |
| **Main Overview** (`/dashboard`) | `/api/proxy/query` | GraphQL over HTTP POST | Go Dashboard BFF (`dashboard-bff`), reading gRPC from Gateway & Alerts microservices |
| **Area Drill-Down** (`/areas/[id]`) | `/api/proxy/query` | GraphQL over HTTP POST | Go Dashboard BFF (`dashboard-bff`) |
| **Engine A Intelligence** (`/dashboard/engine-a`) | `/api/proxy/v1/reliability/summary`<br>`/api/proxy/v1/priorities`<br>`/api/proxy/v1/reliability/trend` | REST over HTTP GET | Go API Gateway (`gateway`), querying PostgreSQL materialized tables directly (`CQRS_Engine_Integration_Standard.md`) |
| **Engine A Ingestion** (`/dashboard/ingestion/engine-a`) | `/api/proxy/v1/reliability/ingest` | REST over HTTP POST | Go API Gateway (`gateway`) -> Python `engine_a` microservice -> PostgreSQL |
| **Real-time Event Stream** | `/api/ws-proxy` | WebSocket | Go Dashboard BFF (`dashboard-bff`) subscription *(Authentication currently failing)* |

---

## 3. Chronological Timeline

- **Thu Oct 8 13:58:13 2026 +0100 (`2fc0433`)**: Implemented REST read-path endpoints (`/api/v1/reliability/summary`, `/api/v1/reliability/trend`, `/api/v1/priorities`) in Go API Gateway for Engine A CQRS.
- **Thu Oct 8 13:59:50 2026 +0100 (`4b68537`)**: Created Architectural Decision Record (`CQRS_Engine_Integration_Standard.md`) documenting the requirement to bypass GraphQL for standalone engine pages.
- **Thu Oct 8 14:03:28 2026 +0100 (`3f68a95`)**: Migrated Engine A React hooks (`useReliabilityMetrics`, `usePriorityRanking`, `useReliabilityTrend`) from GraphQL to REST proxy endpoints.
- **Thu Oct 8 15:04:56 2026 +0100 (`027dee5`)**: Added `/api/v1/reliability/ingest` endpoint in Gateway, atomic SQL transaction with advisory lock, and database migration `20261008000000_risk_history.sql`.
- **Thu Oct 8 16:22:29 2026 +0100 (`fd6de0e`)**: Fixed login spinner and redirect loops by rewriting Next.js proxy route to handle httpOnly session cookies and envelope unpacking.
- **Fri Oct 9 10:05:03 2026 +0100 (`7ff6bbb`)**: Added backend token refresh endpoint in Go auth service; re-scoped cookie path to `/api/proxy` to resolve 15-minute logouts.
- **Fri Oct 9 10:23:44 2026 +0100 (`9662ddc`)**: Migrated main dashboard data fetching from Server Component to Client Component using proxy-based GraphQL client with session credentials, fixing the 401 error.
- **Fri Oct 9 15:17:52 2026 +0100 (`36564bb`)**: Fixed Engine A scoring window backward in `aligner.py`; fixed priority table status badges and score colors; added trend range toggle; mounted `QueryProvider` in root layout to fix `/areas/[id]` crash.
- **Subsequent Live Deployment & Production Status**: UNSURE (no deployment steps or production status checks were performed or logged).

---

## 4. Lessons Learned

1. **Verify Temporal Boundaries Across Service Boundaries**: The gateway checked that outages happened *before* the cycle, while the AI engine scored the 24 hours *after* the cycle. Cross-service time series contracts must verify that evaluation windows match direction and duration.
2. **Standardize Enum Cases Across Languages**: The Go gateway emitted uppercase `"STABLE"`, but the TypeScript frontend expected title-case `"Stable"`. Enums shared across languages should use case-insensitive parsing to avoid silent UI fallback errors.
3. **Cookie Path Scoping Directly Dictates API Proxy Visibility**: A cookie scoped to `Path: "/api/auth/refresh"` is never sent to `/api/proxy/...`. Paths for authentication cookies must encompass all origins and proxy prefixes that consume them.
4. **Mount Global Context Providers in the Root Layout**: Wrapping nested sub-layouts (such as `/dashboard`) with global providers breaks external or sibling routes (such as `/areas/[id]`) and triggers unintended cache evictions on navigation.
5. **Inspect the Active Network Path Before Modifying Schemas**: Modifying protobufs, gRPC contracts, and GraphQL resolvers for a dashboard that fetches over REST CQRS produced out-of-scope code changes that had to be reverted. Always confirm which network path is in use.
6. **Understand Metric Polarity Before Styling UI**: Assuming higher numbers represented higher risk caused healthy feeders to display in alarm red. Health metrics (0 to 100, where 100 is healthy) must be clearly distinguished from risk indexes.
7. **Single-Flight Guards Prevent Refresh Stampedes**: When multiple queries fire simultaneously upon token expiration, single-flight deduplication is necessary to prevent concurrent token refresh race conditions.

---

## 5. What Is Still Open

1. **Acknowledge Button**: In `frontend/components/engine-a/priority-table.tsx`, the button only logs `console.log("Acknowledged: ", row.id)`. It does not call any backend mutation or persist state.
2. **WebSocket Authentication Failure & Nil Pointer Crash**: The WebSocket client in `frontend/lib/websocket-client.ts` still fails to authenticate because the browser cannot read httpOnly session cookies via JavaScript, and the Go `dashboard-bff` crashes with a nil pointer dereference when connection initialization fails.
3. **Engine A Test Fixtures**: Test fixtures in `backend/ai-services/engine_a/tests/` still assume the old forward-looking evaluation window and have not been updated for the backward 24-hour window.
4. **Redeployment Status**: Code changes have been committed and pushed to GitHub `main` (`36564bb`), but whether Engine A and the microservices have been redeployed to live staging or production infrastructure is UNSURE.
5. **Unknown Time Range Fallback**: In `backend/services/gateway/handlers/dashboard_repo.go`, unsupported or unknown `timeRange` query strings silently fall back to 24 hours. The API lacks an endpoint exposing valid range options to clients.

---

## 6. Non-Technical Summary

GridSense AI monitors electrical power feeders and highlights areas at risk of failure. During recent work, the team resolved several core problems affecting user access, calculations, and visual reporting.

First, operators were logged out every fifteen minutes due to mismatched cookie security paths; we re-architected session management so logins remain active and secure.

Second, the calculation engine was evaluating the twenty-four hours after an assessment rather than past outages, causing vulnerable power lines to appear completely healthy. Re-aligning the calculation window ensures real outages properly lower health scores.

Finally, the dashboard displayed stable power lines in red warning colors due to capitalization mismatches and reversed color rules, while feeder detail pages crashed due to missing background data connections. We aligned the data connections and corrected the visual indicators, ensuring operators see reliable, accurate grid information.

---

## 7. Project Statistics

- **Major Problems Cataloged & Resolved**: **11**
- **Layers Touched**: **5** (Database schema migrations, Python calculation engine, Go Gateway and Auth microservices, Next.js API proxy and middleware, React frontend components).
- **Biggest Single Root Cause**: **Mismatched interface contracts across service boundaries** (time series window direction, cookie path scopes, string capitalization differences, and layout provider scoping).
