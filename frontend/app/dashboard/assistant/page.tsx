import { Metadata } from "next";
import { ChatLayout } from "@/components/assistant/chat-layout";

export const metadata: Metadata = {
  title: "AI Assistant | GridSense AI",
  description:
    "Explainable power distribution co-pilot with zero-hallucination telemetry citations and multi-engine grounding.",
};

export default function AssistantPage() {
  return <ChatLayout />;
}
