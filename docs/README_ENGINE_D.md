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
* **Live Server Status:** `pnpm dev` running cleanly on port `3000`.
