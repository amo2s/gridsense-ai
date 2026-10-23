"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAssistantStore, ChatMessage } from "@/store/assistant-store";
import { useUIStore } from "@/store/ui-store";
import { MessageBubble } from "./message-bubble";
import { OptimisticLoader } from "./optimistic-loader";
import { 
  Bot, 
  Send, 
  RotateCcw, 
  Sparkles, 
  Zap, 
  Layers, 
  ShieldAlert, 
  Activity,
  AlertTriangle
} from "lucide-react";

const STARTER_PROMPTS = [
  {
    title: "Outage Risk Analysis",
    prompt: "Explain the forecasted 24-hour outage risk and contributing factors on this feeder.",
    icon: Zap,
  },
  {
    title: "Harmonic Anomalies",
    prompt: "Why was this feeder flagged by Engine C for voltage distortion?",
    icon: Layers,
  },
  {
    title: "Intervention Priorities",
    prompt: "Which grid circuit requires immediate maintenance intervention and why?",
    icon: ShieldAlert,
  },
  {
    title: "Macro Reliability",
    prompt: "What caused the system reliability score to decrease over the last 24 hours?",
    icon: Activity,
  },
];

export function ChatLayout() {
  const [inputQuery, setInputQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Zustand Store Subscriptions
  const {
    sessionId,
    activeFeederId,
    chatHistory,
    isThinking,
    addMessage,
    setIsThinking,
    resetSession,
    clearChat,
    setActiveFeederId,
  } = useAssistantStore();

  // Sync Global Feeder Context from UI Store if not set locally
  const activeFeederContext = useUIStore((s) => s.activeFeederContext);

  useEffect(() => {
    if (activeFeederContext && activeFeederContext !== activeFeederId) {
      setActiveFeederId(activeFeederContext);
    }
  }, [activeFeederContext, activeFeederId, setActiveFeederId]);

  // Smooth Auto-Scroll Hook
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isThinking]);

  // Form Submission Handler
  const handleSendMessage = async (queryToSend?: string) => {
    const rawQuery = queryToSend ?? inputQuery;
    const trimmedQuery = rawQuery.trim();

    if (!trimmedQuery || isThinking) {
      return;
    }

    // 1. Instantly append User turn to Zustand store
    const userMessage: ChatMessage = {
      role: "user",
      content: trimmedQuery,
      timestamp: new Date().toISOString(),
    };

    addMessage(userMessage);
    setInputQuery("");
    setIsThinking(true);

    // 2. Prepare payload mapping for Go Gateway
    const effectiveFeeder = activeFeederId || activeFeederContext || null;
    const historyPayload = chatHistory.slice(-20).map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));

    const payload = {
      query: trimmedQuery,
      session_id: sessionId,
      chat_history: historyPayload,
      feeder_id: effectiveFeeder,
    };

    try {
      const response = await fetch("/api/proxy/v1/assistant/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";

      if (response.ok) {
        const data = contentType.includes("application/json")
          ? await response.json()
          : { answer: await response.text(), citations: [] };

        // Append Assistant Answer & Citations
        addMessage({
          role: "assistant",
          content: data.answer || "Diagnostic telemetry received with no text narrative.",
          citations: Array.isArray(data.citations) ? data.citations : [],
          timestamp: new Date().toISOString(),
        });
      } else {
        // Handle upstream non-200 errors (504 Timeout, 503 Circuit Breaker, 400 Bad Request)
        let errorMsg = `Upstream Error [${response.status}]`;
        if (contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMsg = errorData.message || errorData.error || errorMsg;
        } else {
          const rawErr = await response.text();
          if (rawErr) errorMsg = rawErr;
        }

        if (response.status === 504) {
          errorMsg = "Gateway Timeout: The AI Assistant sovereign inference engine timed out after 35 seconds. The distribution grid microservices may be experiencing high telemetry volume.";
        } else if (response.status === 503) {
          errorMsg = "Service Unavailable: The AI Assistant circuit breaker is currently open due to consecutive upstream timeouts. Automatic recovery will engage shortly.";
        }

        addMessage({
          role: "assistant",
          content: errorMsg,
          isError: true,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (networkError: any) {
      addMessage({
        role: "assistant",
        content: `Network Connection Error: Failed to reach the Next.js AI proxy. (${networkError?.message || "Check control room connectivity."})`,
        isError: true,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setIsThinking(false);
      // Re-focus input
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col rounded-2xl border border-slate-200/90 bg-[#F8FAFC] shadow-sm overflow-hidden">
      {/* 1. Header Bar (Liquid Glass Accent) */}
      <div className="flex items-center justify-between border-b border-slate-200/90 bg-white/90 px-6 py-3.5 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-sm">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold text-slate-900 tracking-tight">
                GridSense AI Assistant
              </h1>
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                Sovereign Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Grounded power distribution diagnostics with zero-hallucination telemetry citations.
            </p>
          </div>
        </div>

        {/* Operational Scope & Actions */}
        <div className="flex items-center gap-3">
          {/* Feeder Scope Pill */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-600 font-medium">
            <span className="text-slate-400">Target Feeder:</span>
            <span className="font-mono text-emerald-700 font-semibold truncate max-w-[140px]">
              {activeFeederId || activeFeederContext || "Global Network"}
            </span>
          </div>

          {/* Reset Session Button */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset active conversational session? Encrypted history will be cleared.")) {
                resetSession();
              }
            }}
            title="Reset active conversational thread"
            aria-label="Reset active session"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span className="hidden md:inline">New Session</span>
          </button>
        </div>
      </div>

      {/* 2. Chat Message Stream */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-2">
        {chatHistory.length === 0 ? (
          /* Empty State: Operational Starter Prompts */
          <div className="flex flex-col items-center justify-center h-full max-w-2xl mx-auto text-center py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-600 mb-4 shadow-sm">
              <Sparkles className="h-7 w-7" />
            </div>
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              Distribution Network Operational Co-Pilot
            </h2>
            <p className="text-sm text-slate-500 max-w-lg mb-8">
              Ask diagnostic questions regarding feeder outage risk, harmonic distortion anomalies,
              or reinforcement learning intervention priorities. All responses are verified against live telemetry.
            </p>

            {/* Starter Prompt Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full text-left">
              {STARTER_PROMPTS.map((item) => {
                const IconComponent = item.icon;
                return (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => handleSendMessage(item.prompt)}
                    className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all duration-200 text-left group focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 group-hover:text-emerald-700">
                      <IconComponent className="h-4 w-4 text-emerald-600 shrink-0" />
                      {item.title}
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">
                      {item.prompt}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          /* Message List */
          chatHistory.map((message, index) => (
            <MessageBubble
              key={`${message.timestamp || index}-${index}`}
              message={message}
              index={index}
            />
          ))
        )}

        {/* Multi-stage Optimistic Loading Indicator */}
        {isThinking && <OptimisticLoader />}

        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* 3. Input Console & Send Controls */}
      <div className="border-t border-slate-200/90 bg-white/95 p-4 backdrop-blur-md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative max-w-4xl mx-auto flex items-end gap-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 p-2 shadow-inner focus-within:border-emerald-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500/20 transition-all"
        >
          <textarea
            ref={inputRef}
            rows={1}
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about feeder health, risk scores, or Engine A-D analytics... (Enter to send)"
            aria-label="Ask the GridSense AI Assistant"
            disabled={isThinking}
            className="flex-1 max-h-32 min-h-[44px] resize-none bg-transparent px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none disabled:opacity-50"
          />

          <button
            type="submit"
            disabled={!inputQuery.trim() || isThinking}
            aria-label="Submit query to GridSense AI Assistant"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow transition-all hover:bg-emerald-700 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        <div className="flex items-center justify-between max-w-4xl mx-auto mt-2 px-2 text-[11px] text-slate-400">
          <span>
            AES-GCM zero-trust encrypted memory &bull; 35s sovereign RAG budget
          </span>
          <span className="font-mono">
            Session: {sessionId.substring(0, 8)}...
          </span>
        </div>
      </div>
    </div>
  );
}
