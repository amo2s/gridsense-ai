import fs from "fs";
import path from "path";

async function verifyUIArchitecture() {
  console.log("=================================================================");
  console.log("GRIDSENSE AI ASSISTANT: PREMIUM UI OVERHAUL & XAI AUDIT");
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
    "components/assistant/feature-modal.tsx",
    "app/dashboard/assistant/page.tsx",
    "store/assistant-store.ts",
  ];

  for (const relPath of assistantFiles) {
    const fullPath = path.resolve(process.cwd(), relPath);
    assert(fs.existsSync(fullPath), `File exists: ${relPath}`);
  }

  // TEST 1: Global Visual Governance & Canvas Layout (Strict Light Mode)
  const chatLayoutPath = path.resolve(process.cwd(), "components/assistant/chat-layout.tsx");
  const chatLayoutContent = fs.readFileSync(chatLayoutPath, "utf-8");
  assert(
    chatLayoutContent.includes("bg-white") && chatLayoutContent.includes("bg-slate-50"),
    "ChatLayout implements strict light mode canvas background"
  );
  assert(
    !chatLayoutContent.includes("Sparkles"),
    "ChatLayout removes all Sparkles icons"
  );
  assert(
    chatLayoutContent.includes("/gridsense-logo.png"),
    "ChatLayout renders official brand logo from public directory"
  );
  assert(
    chatLayoutContent.includes("[&::-webkit-scrollbar]:w-1.5"),
    "ChatLayout configures ultra-thin subtle scrollbar utilities"
  );

  // TEST 2: Redundant Header Stripping in MessageBubble
  const bubblePath = path.resolve(process.cwd(), "components/assistant/message-bubble.tsx");
  const bubbleContent = fs.readFileSync(bubblePath, "utf-8");
  assert(
    !bubbleContent.includes("GridSense AI Diagnostic Intelligence"),
    "MessageBubble stripped redundant 'GridSense AI Diagnostic Intelligence' header"
  );
  assert(
    !bubbleContent.includes("System Diagnostics Alert"),
    "MessageBubble stripped redundant 'System Diagnostics Alert' header"
  );
  assert(
    bubbleContent.includes("/gridsense-logo.png"),
    "MessageBubble uses official GridSense logo avatar"
  );

  // TEST 3: AI Bubble Emerald & User Bubble Crisp White Styling
  assert(
    bubbleContent.includes("from-emerald-600") || bubbleContent.includes("bg-emerald-600"),
    "AI Message Bubble implements rich Emerald aesthetic"
  );
  assert(
    bubbleContent.includes("bg-white") && bubbleContent.includes("text-slate-900"),
    "User Message Bubble implements Crisp White with text-slate-900 contrast"
  );
  assert(
    bubbleContent.includes("rounded-2xl rounded-tl-sm"),
    "AI bubble features asymmetrical rounded-tl-sm border radius"
  );
  assert(
    bubbleContent.includes("rounded-2xl rounded-tr-sm"),
    "User bubble features asymmetrical rounded-tr-sm border radius"
  );

  // TEST 4: Action Toolbars in MessageBubble
  assert(bubbleContent.includes("navigator.clipboard.writeText"), "MessageBubble implements functional clipboard copy");
  assert(bubbleContent.includes("Volume2"), "AI Toolbar includes Sound/Voice action icon");
  assert(bubbleContent.includes("ThumbsUp"), "AI Toolbar includes Thumbs Up action icon");
  assert(bubbleContent.includes("ThumbsDown"), "AI Toolbar includes Thumbs Down action icon");
  assert(bubbleContent.includes("Share2"), "AI Toolbar includes Share action icon");
  assert(bubbleContent.includes("Trash2"), "User Toolbar includes Trash/Delete action icon");
  assert(bubbleContent.includes("deleteMessage(index)"), "User Toolbar triggers Zustand deleteMessage");

  // TEST 5: Zustand Store deleteMessage Capability
  const storePath = path.resolve(process.cwd(), "store/assistant-store.ts");
  const storeContent = fs.readFileSync(storePath, "utf-8");
  assert(storeContent.includes("deleteMessage: (index: number) => void"), "AssistantState declares deleteMessage action");
  assert(storeContent.includes("filter((_, idx) => idx !== indexToDelete)"), "useAssistantStore implements message index deletion");
  assert(storeContent.includes("enforceSlidingWindow"), "deleteMessage maintains sliding window recalculation");

  // TEST 6: Composer Dock Action Triggers
  assert(chatLayoutContent.includes("Plus"), "Composer Dock includes Plus (+) action trigger");
  assert(chatLayoutContent.includes("Mic"), "Composer Dock includes Mic action trigger");
  assert(chatLayoutContent.includes("Send"), "Composer Dock includes primary Send action trigger");
  assert(chatLayoutContent.includes("FeatureModal"), "ChatLayout wires actions to FeatureModal");

  // TEST 7: Feature Coming Soon Portal Modal (Strict Light Mode & Simplified)
  const modalPath = path.resolve(process.cwd(), "components/assistant/feature-modal.tsx");
  const modalContent = fs.readFileSync(modalPath, "utf-8");
  assert(modalContent.includes("createPortal"), "FeatureModal utilizes React createPortal");
  assert(modalContent.includes("This feature is coming soon"), "FeatureModal renders simplified 'This feature is coming soon' title text");
  assert(!modalContent.includes("Sparkles"), "FeatureModal removes Sparkles icon");
  assert(modalContent.includes("backdrop-blur"), "FeatureModal implements backdrop blur");

  // TEST 8: Advanced Wave-Motion Optimistic Loader
  const loaderPath = path.resolve(process.cwd(), "components/assistant/optimistic-loader.tsx");
  const loaderContent = fs.readFileSync(loaderPath, "utf-8");
  assert(loaderContent.includes("animate-bounce"), "OptimisticLoader implements wave typing indicator");
  assert(loaderContent.includes("[animation-delay:-0.3s]"), "OptimisticLoader utilizes staggered animation delay");
  assert(loaderContent.includes("Vectorizing Query..."), "OptimisticLoader rotates 'Vectorizing Query...'");
  assert(loaderContent.includes("Retrieving Telemetry..."), "OptimisticLoader rotates 'Retrieving Telemetry...'");
  assert(loaderContent.includes("Synthesizing Diagnostic Answer..."), "OptimisticLoader rotates 'Synthesizing Diagnostic Answer...'");
  assert(loaderContent.includes("/gridsense-logo.png"), "OptimisticLoader displays GridSense logo avatar");

  // TEST 9: XAI Citation Matrix Dynamic Badging
  const cardPath = path.resolve(process.cwd(), "components/assistant/citation-card.tsx");
  const cardContent = fs.readFileSync(cardPath, "utf-8");
  assert(cardContent.includes("Engine C Grounded"), "CitationCard supports Engine C Grounded badge");
  assert(cardContent.includes("Engine B Grounded"), "CitationCard supports Engine B Grounded badge");
  assert(cardContent.includes("Engine D Grounded"), "CitationCard supports Engine D Grounded badge");
  assert(cardContent.includes("Telemetry Grounded"), "CitationCard supports Telemetry Grounded badge");
  assert(cardContent.includes("tabIndex={0}"), "CitationCard includes tabIndex={0} for keyboard accessibility");
  assert(cardContent.includes("font-mono"), "CitationCard renders record_id in font-mono");

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
