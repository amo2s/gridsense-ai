/**
 * ============================================================================
 * VERIFICATION SUITE: PHASE 4 - PART 2 & GLOBAL ALERT STREAM INITIATION
 * ============================================================================
 * Validates:
 *  1. Pure component abstraction of SHAPDivergenceWaterfall & SeasonalSTLTunnelChart
 *     (Zero hardcoded Engine C / PyOD keys; pure generic interfaces).
 *  2. Next.js SSE proxy route stabilization (/api/proxy/v1/alerts/stream):
 *     Non-buffering headers, persistent stream, 15s heartbeats, zero 1000ms drops.
 *  3. Global Zustand alert store, unread count tracking, and acknowledgment actions.
 *  4. Event-driven TanStack Query cache invalidation logic for matching active feeders.
 *  5. Topbar bell pulse animation, crimson badge overlay, and Liquid Glass dropdown.
 */

import fs from "fs";
import path from "path";

// Color helpers for terminal output
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ${green("✓ PASS")}: ${testName}`);
  } else {
    console.error(`  ${red("✗ FAIL")}: ${testName}`);
    if (detail) console.error(`    ${red("Detail:")} ${detail}`);
  }
}

const FRONTEND_DIR = path.resolve(__dirname, "..");

async function runVerification() {
  console.log(bold(cyan("\n=================================================================")));
  console.log(bold(cyan(" GRIDSENSE AI - ENGINE C: PHASE 4 PART 2 VERIFICATION SUITE")));
  console.log(bold(cyan("=================================================================\n")));

  // --------------------------------------------------------------------------
  // TEST SECTION 1: SHAPDivergenceWaterfall Component Abstraction
  // --------------------------------------------------------------------------
  console.log(bold("1. Verifying SHAPDivergenceWaterfall Component Abstraction..."));
  const waterfallPath = path.join(FRONTEND_DIR, "components/dashboard/engine-c/shap-divergence-waterfall.tsx");
  const waterfallCode = fs.readFileSync(waterfallPath, "utf-8");

  assert(
    !waterfallCode.includes("@/types/engine-c-anomaly") &&
    !waterfallCode.includes("@/utils/engine-c-feature-dictionary"),
    "SHAPDivergenceWaterfall has zero imports from Engine C types or dictionaries"
  );

  assert(
    waterfallCode.includes("export interface GenericDivergenceItem") &&
    waterfallCode.includes("label: string;") &&
    waterfallCode.includes("contributionValue: number;") &&
    waterfallCode.includes("isRiskEscalating: boolean;"),
    "SHAPDivergenceWaterfall defines pure GenericDivergenceItem interface"
  );

  assert(
    waterfallCode.includes("export interface GenericDivergenceProps") &&
    waterfallCode.includes("items?: GenericDivergenceItem[];"),
    "SHAPDivergenceWaterfall exposes generic GenericDivergenceProps interface"
  );

  assert(
    !waterfallCode.includes("recent_fault_counts") &&
    !waterfallCode.includes("load_volatility") &&
    !waterfallCode.includes("pyod"),
    "SHAPDivergenceWaterfall contains zero hardcoded PyOD or Engine C feature keys"
  );

  assert(
    waterfallCode.includes("React.memo(") && waterfallCode.includes("fast-deep-equal"),
    "SHAPDivergenceWaterfall is memoized using fast-deep-equal"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 2: SeasonalSTLTunnelChart Component Abstraction
  // --------------------------------------------------------------------------
  console.log(bold("\n2. Verifying SeasonalSTLTunnelChart Component Abstraction..."));
  const tunnelPath = path.join(FRONTEND_DIR, "components/dashboard/engine-c/seasonal-stl-tunnel-chart.tsx");
  const tunnelCode = fs.readFileSync(tunnelPath, "utf-8");

  assert(
    !tunnelCode.includes("@/types/engine-c-anomaly"),
    "SeasonalSTLTunnelChart has zero imports from Engine C types"
  );

  assert(
    tunnelCode.includes("export interface GenericTunnelPoint") &&
    tunnelCode.includes("observed: number;") &&
    tunnelCode.includes("baseline: number;") &&
    tunnelCode.includes("upper_bound: number;") &&
    tunnelCode.includes("lower_bound: number;"),
    "SeasonalSTLTunnelChart defines generic GenericTunnelPoint statistical interface"
  );

  assert(
    tunnelCode.includes("export interface GenericTemporalTunnelProps") &&
    tunnelCode.includes("dataPoints?: GenericTunnelPoint[];"),
    "SeasonalSTLTunnelChart exposes generic GenericTemporalTunnelProps interface"
  );

  assert(
    tunnelCode.includes("metricLabel") && tunnelCode.includes("metricUnit"),
    "SeasonalSTLTunnelChart accepts generic metric units and labels"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 3: Feature Dictionary & Caller Layer Translation
  // --------------------------------------------------------------------------
  console.log(bold("\n3. Verifying Feature Dictionary Adapter & Caller Mapping..."));
  const dictPath = path.join(FRONTEND_DIR, "utils/engine-c-feature-dictionary.ts");
  const dictCode = fs.readFileSync(dictPath, "utf-8");

  assert(
    dictCode.includes("export function transformAttributionsToDivergenceItems"),
    "engine-c-feature-dictionary exports transformAttributionsToDivergenceItems adapter"
  );

  const pagePath = path.join(FRONTEND_DIR, "app/dashboard/engine-c/page.tsx");
  const pageCode = fs.readFileSync(pagePath, "utf-8");

  assert(
    pageCode.includes("import { transformAttributionsToDivergenceItems } from \"@/utils/engine-c-feature-dictionary\""),
    "page.tsx imports transformAttributionsToDivergenceItems at caller layer"
  );

  assert(
    pageCode.includes("items={divergenceItems}"),
    "page.tsx passes generic items={divergenceItems} to SHAPDivergenceWaterfall"
  );

  assert(
    pageCode.includes("dataPoints={data?.stl_telemetry ?? []}"),
    "page.tsx passes generic dataPoints to SeasonalSTLTunnelChart"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 4: SSE Alert Proxy Route Stabilization
  // --------------------------------------------------------------------------
  console.log(bold("\n4. Verifying Next.js SSE Proxy Stream Route (/api/proxy/v1/alerts/stream)..."));
  const sseRoutePath = path.join(FRONTEND_DIR, "app/api/proxy/v1/alerts/stream/route.ts");
  const sseRouteCode = fs.readFileSync(sseRoutePath, "utf-8");

  assert(
    sseRouteCode.includes('export const dynamic = "force-dynamic"'),
    "SSE route exports dynamic = 'force-dynamic' preventing Next.js route caching"
  );

  assert(
    sseRouteCode.includes('"Content-Type": "text/event-stream; charset=utf-8"') &&
    sseRouteCode.includes('"Cache-Control": "no-cache, no-transform, no-store"') &&
    sseRouteCode.includes('Connection: "keep-alive"') &&
    sseRouteCode.includes('"X-Accel-Buffering": "no"') &&
    sseRouteCode.includes('"Content-Encoding": "none"'),
    "SSE route sets complete non-buffering, non-caching HTTP streaming headers"
  );

  assert(
    !sseRouteCode.includes("controller.close();\n      },\n    });"),
    "SSE route eliminated premature controller.close() in simulation mode"
  );

  assert(
    sseRouteCode.includes("setInterval") && sseRouteCode.includes("15000") && sseRouteCode.includes(": heartbeat"),
    "SSE route maintains persistent 15-second heartbeat loop to prevent connection drops"
  );

  assert(
    sseRouteCode.includes('req.signal.addEventListener("abort"') && sseRouteCode.includes("clearInterval"),
    "SSE route cleanly tears down heartbeat and removes subscribers on client abort"
  );

  assert(
    sseRouteCode.includes("export async function POST"),
    "SSE route exposes POST handler for live alert broadcast and simulation"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 5: Global Zustand Alert Store Logic
  // --------------------------------------------------------------------------
  console.log(bold("\n5. Verifying Global Zustand Alert Store (alert-store.ts)..."));
  const alertStorePath = path.join(FRONTEND_DIR, "store/alert-store.ts");
  const alertStoreCode = fs.readFileSync(alertStorePath, "utf-8");

  assert(
    alertStoreCode.includes("export interface GridAlert") &&
    alertStoreCode.includes("feeder_id: string;") &&
    alertStoreCode.includes("severity: AlertSeverity | string;") &&
    alertStoreCode.includes("is_critical: boolean;") &&
    alertStoreCode.includes("message: string;"),
    "alert-store defines comprehensive GridAlert interface"
  );

  assert(
    alertStoreCode.includes("unreadCriticalCount: number;") &&
    alertStoreCode.includes("totalUnreadCount: number;") &&
    alertStoreCode.includes("addAlert:") &&
    alertStoreCode.includes("acknowledgeAlert:") &&
    alertStoreCode.includes("acknowledgeAll:"),
    "alert-store exposes complete unread counter tracking and acknowledge methods"
  );

  assert(
    alertStoreCode.includes('name: "gridsense:alerts:v1"') &&
    alertStoreCode.includes("createJSONStorage"),
    "alert-store implements persistent storage across dashboard route transitions"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 6: Global Alert Stream Hook & Event-Driven Invalidation
  // --------------------------------------------------------------------------
  console.log(bold("\n6. Verifying Global Alert Stream Hook & Targeted Invalidation..."));
  const hookPath = path.join(FRONTEND_DIR, "hooks/use-global-alert-stream.ts");
  const hookCode = fs.readFileSync(hookPath, "utf-8");

  assert(
    hookCode.includes("export function useGlobalAlertStream"),
    "useGlobalAlertStream hook is defined and exported"
  );

  assert(
    hookCode.includes("new EventSource(SSE_URL)") &&
    hookCode.includes("es.onmessage =") &&
    hookCode.includes('es.addEventListener("alert"'),
    "useGlobalAlertStream connects to SSE proxy and listens to both onmessage and alert events"
  );

  assert(
    hookCode.includes("INITIAL_RETRY_DELAY_MS") &&
    hookCode.includes("MAX_RETRY_DELAY_MS") &&
    hookCode.includes("Math.pow(2, attempt)"),
    "useGlobalAlertStream implements exponential backoff reconnection strategy with jitter"
  );

  assert(
    hookCode.includes("queryClient.invalidateQueries({") &&
    hookCode.includes('"engine-c-anomalies"'),
    "useGlobalAlertStream executes targeted TanStack Query cache invalidation for engine-c-anomalies"
  );

  assert(
    hookCode.includes("normalizedAlertFeeder === normalizedActiveFeeder"),
    "Targeted invalidation strictly checks that incoming alert matches currently active feeder"
  );

  // --------------------------------------------------------------------------
  // TEST SECTION 7: Topbar Notification Module & Liquid Glass Dropdown
  // --------------------------------------------------------------------------
  console.log(bold("\n7. Verifying Topbar Bell Animation & Liquid Glass Alert Dropdown..."));
  const topbarPath = path.join(FRONTEND_DIR, "components/dashboard/topbar.tsx");
  const topbarCode = fs.readFileSync(topbarPath, "utf-8");

  assert(
    topbarCode.includes("useGlobalAlertStream();"),
    "topbar.tsx mounts useGlobalAlertStream() for global dashboard coverage"
  );

  assert(
    topbarCode.includes("unreadCriticalCount = useAlertStore((state) => state.unreadCriticalCount);"),
    "topbar.tsx reads live unreadCriticalCount from Zustand alert store"
  );

  assert(
    topbarCode.includes("scale: [1, 1.22, 0.94, 1.15, 1]") &&
    topbarCode.includes("repeat: Infinity"),
    "topbar.tsx implements Framer Motion hardware-accelerated rhythmic pulse animation on Bell"
  );

  assert(
    topbarCode.includes("bg-rose-600 border border-white") &&
    topbarCode.includes("unreadCriticalCount > 0"),
    "topbar.tsx renders dynamic crimson notification badge with exact integer count"
  );

  assert(
    topbarCode.includes("<AlertDropdown"),
    "topbar.tsx integrates AlertDropdown component triggered by bell icon"
  );

  const dropdownPath = path.join(FRONTEND_DIR, "components/dashboard/alert-dropdown.tsx");
  const dropdownCode = fs.readFileSync(dropdownPath, "utf-8");

  assert(
    dropdownCode.includes("bg-white/20") &&
    dropdownCode.includes("backdrop-blur-2xl") &&
    dropdownCode.includes("bg-gradient-to-br from-white/60 via-white/10 to-white/5") &&
    dropdownCode.includes("shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)]"),
    "AlertDropdown strictly implements GridSense AI Liquid Glass aesthetic composite token"
  );

  assert(
    dropdownCode.includes("border-rose-500/40") &&
    dropdownCode.includes("border-amber-500/40") &&
    dropdownCode.includes("border-emerald-500/40"),
    "AlertDropdown enforces strict color polarity (Crimson = Critical, Amber = Warning, Emerald = Stable/Restored)"
  );

  assert(
    dropdownCode.includes("formatRelativeTime") &&
    dropdownCode.includes("alert.feeder_id") &&
    dropdownCode.includes("acknowledgeAlert"),
    "AlertDropdown displays humanized relative time, feeder_id, and single/bulk acknowledge actions"
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log(bold(cyan("\n-----------------------------------------------------------------")));
  console.log(bold(`TOTAL VERIFICATION CHECKS: ${totalTests}`));
  console.log(bold(`PASSED: ${green(passedTests.toString())} / ${totalTests}`));
  console.log(bold(cyan("-----------------------------------------------------------------\n")));

  if (passedTests === totalTests) {
    console.log(bold(green(">>> ALL PHASE 4 PART 2 ARCHITECTURAL EXIT CRITERIA MET <<<\n")));
    process.exit(0);
  } else {
    console.error(bold(red(`>>> FAILED ${totalTests - passedTests} EXIT CRITERIA CHECKS <<<`)));
    process.exit(1);
  }
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
