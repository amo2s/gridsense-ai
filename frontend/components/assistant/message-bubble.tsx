"use client";

import React from "react";
import { ChatMessage } from "@/store/assistant-store";
import { CitationCard } from "./citation-card";
import { AlertCircle, Bot, CheckCircle2, ShieldCheck, User } from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
}

export function MessageBubble({ message, index }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = Boolean(message.isError);

  // Format timestamp (e.g. "12:45 PM")
  const formattedTime = React.useMemo(() => {
    if (!message.timestamp) return "";
    try {
      const date = new Date(message.timestamp);
      return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }, [message.timestamp]);

  if (isUser) {
    return (
      <div className="flex items-end justify-end gap-2.5 my-3 animate-fade-in">
        <div className="flex flex-col items-end max-w-[85%] md:max-w-[70%]">
          <div className="rounded-2xl rounded-br-sm bg-emerald-600 px-4 py-3 text-sm text-white shadow-sm">
            <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
          </div>
          {formattedTime && (
            <span className="mt-1 text-[11px] text-slate-400 font-medium px-1">
              {formattedTime}
            </span>
          )}
        </div>

        {/* User Icon Avatar */}
        <div className="flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg bg-emerald-700 text-white shadow-sm">
          <User className="h-4 w-4" />
        </div>
      </div>
    );
  }

  // Assistant Message Turn (or Error Message)
  return (
    <div className="flex items-start justify-start gap-2.5 my-4 animate-fade-in">
      {/* Bot Icon Avatar */}
      <div
        className={`flex h-8 w-8 shrink-0 select-none items-center justify-center rounded-lg border shadow-sm ${
          isError
            ? "border-red-200 bg-red-50 text-red-600"
            : "border-emerald-200 bg-emerald-50 text-emerald-600"
        }`}
      >
        {isError ? <AlertCircle className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      <div className="flex flex-col items-start w-full max-w-[95%] md:max-w-[85%]">
        {/* Main Bubble Card (Liquid Glass Styling) */}
        <div
          className={`w-full rounded-2xl rounded-tl-sm border p-4.5 shadow-sm backdrop-blur-sm ${
            isError
              ? "border-red-200 bg-red-50/90 text-red-900"
              : "border-slate-200/90 bg-white/95 text-slate-800"
          }`}
        >
          {/* Top Label */}
          <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-100">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-semibold text-slate-700 tracking-tight">
                {isError ? "System Diagnostics Alert" : "GridSense AI Diagnostic Intelligence"}
              </span>
              {!isError && (
                <span className="inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck className="h-3 w-3" />
                  Sovereign XAI
                </span>
              )}
            </div>

            {formattedTime && (
              <span className="text-[11px] text-slate-400 font-mono">
                {formattedTime}
              </span>
            )}
          </div>

          {/* Primary Answer Content */}
          <div className="prose prose-slate max-w-none text-sm leading-relaxed whitespace-pre-wrap text-slate-800">
            {message.content}
          </div>

          {/* Explainable AI (XAI) Citation Matrix */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2.5">
                <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Grounded Evidence Matrix ({message.citations.length}{" "}
                  {message.citations.length === 1 ? "Record" : "Records"})
                </span>
                <span className="text-[11px] text-slate-400">
                  PostgreSQL pgvector & tsvector RRF
                </span>
              </div>

              {/* Responsive Grid of Citation Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {message.citations.map((citation, citIdx) => (
                  <CitationCard
                    key={`${citation.record_id}-${citIdx}`}
                    citation={citation}
                    index={citIdx}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
