import fs from "fs";
import path from "path";

async function verifyUIArchitecture() {
  console.log("=================================================================");
  console.log("GRIDSENSE AI ASSISTANT: UI & XAI CITATION ARCHITECTURE AUDIT");
  console.log("=================================================================\n");

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedTests++;
    } else {
      console.error(`[FAIL] ${testName} - Detail: ${detail || "Assertion failed"}`);
    }
  }

  const assistantFiles = [
    "components/assistant/citation-card.tsx",
    "components/assistant/optimistic-loader.tsx",
    "components/assistant/message-bubble.tsx",
    "components/assistant/chat-layout.tsx",
    "app/dashboard/assistant/page.tsx",
  ];

  // TEST 1: Strict Light Mode Audit (No dark:* classes)
  for (const relPath of assistantFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert(fs.existsSync(fullPath), `File exists: ${relPath}`);

    const content = fs.readFileSync(fullPath, "utf-8");
    const hasDarkMode = /\bdark:/i.test(content);
    assert(!hasDarkMode, `Strict Light Mode compliance in ${path.basename(relPath)} (zero dark: classes)`);
  }

  // TEST 2: Optimistic Loader Rotating Status Stages
  const loaderPath = path.resolve(process.cwd(), "components/assistant/optimistic-loader.tsx");
  const loaderContent = fs.readFileSync(loaderPath, "utf-8");
  assert(loaderContent.includes("Vectorizing Query..."), "OptimisticLoader includes 'Vectorizing Query...'");
  assert(loaderContent.includes("Retrieving Telemetry..."), "OptimisticLoader includes 'Retrieving Telemetry...'");
  assert(loaderContent.includes("Synthesizing Diagnostic Answer..."), "OptimisticLoader includes 'Synthesizing Diagnostic Answer...'");
  assert(loaderContent.includes("setInterval"), "OptimisticLoader uses native setInterval for rotation");

  // TEST 3: XAI Citation Matrix Dynamic Badging
  const cardPath = path.resolve(process.cwd(), "components/assistant/citation-card.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf-8");
  assert(cardContent.includes("Engine C Grounded"), "CitationCard supports Engine C Grounded badge");
  assert(cardContent.includes("Engine B Grounded"), "CitationCard supports Engine B Grounded badge");
  assert(cardContent.includes("Engine D Grounded"), "CitationCard supports Engine D Grounded badge");
  assert(cardContent.includes("Telemetry Grounded"), "CitationCard supports Telemetry Grounded badge");
  assert(cardContent.includes("tabIndex={0}"), "CitationCard includes tabIndex={0} for keyboard accessibility");
  assert(cardContent.includes("font-mono"), "CitationCard renders record_id in font-mono");

  // TEST 4: Chat Layout Proxy Integration & Error Handling
  const chatLayoutPath = path.resolve(process.cwd(), "components/assistant/chat-layout.tsx");
  const chatLayoutContent = fs.readFileSync(chatLayoutPath, "utf-8");
  assert(chatLayoutContent.includes("/api/proxy/v1/assistant/query"), "ChatLayout routes to dedicated 35s proxy endpoint");
  assert(chatLayoutContent.includes("useAssistantStore"), "ChatLayout binds to useAssistantStore");
  assert(chatLayoutContent.includes("aria-label=\"Ask the GridSense AI Assistant\""), "ChatLayout includes accessible input label");
  assert(chatLayoutContent.includes("scrollIntoView"), "ChatLayout implements smooth auto-scrolling hook");
  assert(chatLayoutContent.includes("Gateway Timeout"), "ChatLayout handles HTTP 504 Gateway Timeout gracefully");
  assert(chatLayoutContent.includes("Service Unavailable"), "ChatLayout handles HTTP 503 Circuit Breaker gracefully");

  // TEST 5: Sidebar Navigation Inclusion
  const sidebarPath = path.resolve(process.cwd(), "components/dashboard/sidebar.tsx");
  const sidebarContent = fs.readFileSync(sidebarPath, "utf-8");
  assert(sidebarContent.includes("/dashboard/assistant"), "Sidebar MENU_ITEMS includes /dashboard/assistant");
  assert(sidebarContent.includes("AI Assistant"), "Sidebar menu entry labeled 'AI Assistant'");

  console.log(`\n=================================================================`);
  console.log(`TEST SUMMARY: ${passedTests}/${totalTests} Passed (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log(`=================================================================`);

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

verifyUIArchitecture().catch((err) => {
  console.error("UI architecture audit failed:", err);
  process.exit(1);
});
