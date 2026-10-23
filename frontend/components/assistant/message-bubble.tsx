"use client";

import React, { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { ChatMessage, useAssistantStore } from "@/store/assistant-store";
import { CitationCard } from "./citation-card";
import {
  Check,
  Copy,
  Volume2,
  ThumbsUp,
  ThumbsDown,
  Share2,
  Trash2,
  User,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";

interface MessageBubbleProps {
  message: ChatMessage;
  index: number;
  onTriggerFeatureModal: (featureName: string) => void;
}

export function MessageBubble({
  message,
  index,
  onTriggerFeatureModal,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isError = Boolean(message.isError);
  const [copied, setCopied] = useState(false);

  const deleteMessage = useAssistantStore((s) => s.deleteMessage);

  // Copy Content to System Clipboard
  const handleCopyContent = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback or ignore in restricted iframe
    }
  };

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

  // =========================================================================
  // USER MESSAGE TURN
  // =========================================================================
  if (isUser) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        className="flex items-end justify-end gap-3 my-4 group"
      >
        <div className="flex flex-col items-end max-w-[85%] md:max-w-[70%]">
          {/* User Bubble: Crisp White with Liquid Glass Drop Shadow */}
          <div className="relative rounded-2xl rounded-tr-sm bg-white px-5 py-3.5 text-slate-900 shadow-xl shadow-black/20 border border-slate-200/80">
            <p className="whitespace-pre-wrap leading-relaxed text-sm font-normal text-slate-900 selection:bg-emerald-100">
              {message.content}
            </p>

            {/* User Action Toolbar: Copy & Delete */}
            <div className="flex items-center justify-between gap-4 mt-2.5 pt-2 border-t border-slate-100 text-xs">
              {formattedTime && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {formattedTime}
                </span>
              )}

              <div className="flex items-center gap-1">
                {/* Copy Button */}
                <button
                  type="button"
                  onClick={handleCopyContent}
                  aria-label="Copy message text"
                  title="Copy text"
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-slate-800 hover:bg-slate-100 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {copied ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>

                {/* Delete Button */}
                <button
                  type="button"
                  onClick={() => deleteMessage(index)}
                  aria-label="Delete message from history"
                  title="Delete message"
                  className="inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* User Avatar Container: Seamlessly Tucked */}
        <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-slate-800 border border-slate-700 text-slate-200 shadow-md">
          <User className="h-4 w-4" />
        </div>
      </motion.div>
    );
  }

  // =========================================================================
  // ASSISTANT (AI) MESSAGE TURN (OR SYSTEM ERROR)
  // =========================================================================
  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className="flex items-start justify-start gap-3 my-4 group"
    >
      {/* Brand Logo Avatar */}
      <div className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-white/10 p-1 border border-white/15 shadow-md backdrop-blur-md">
        {isError ? (
          <AlertCircle className="h-5 w-5 text-red-400" />
        ) : (
          <Image
            src="/gridsense-logo.png"
            alt="GridSense AI"
            width={28}
            height={28}
            className="rounded-full object-contain"
          />
        )}
      </div>

      <div className="flex flex-col items-start w-full max-w-[95%] md:max-w-[85%]">
        {/* Main AI Bubble: Rich Emerald Aesthetic with Crisp White Typography */}
        <div
          className={`w-full rounded-2xl rounded-tl-sm p-5 shadow-xl transition-all ${
            isError
              ? "bg-red-950/80 border border-red-800 text-red-100 shadow-red-950/30"
              : "bg-gradient-to-br from-emerald-600 via-emerald-600 to-emerald-700 text-white shadow-emerald-950/20 border border-emerald-500/30"
          }`}
        >
          {/* Primary Answer Narrative (No redundant title header) */}
          <div className="prose prose-invert max-w-none text-sm leading-relaxed whitespace-pre-wrap text-white font-normal selection:bg-white/20">
            {message.content}
          </div>

          {/* Explainable AI (XAI) Citation Matrix */}
          {message.citations && message.citations.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-white/15">
              <div className="flex items-center justify-between mb-3 text-emerald-100">
                <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-300" />
                  Verified Evidence Matrix ({message.citations.length}{" "}
                  {message.citations.length === 1 ? "Record" : "Records"})
                </span>
                <span className="text-[10px] text-emerald-200/70 font-mono">
                  pgvector & RRF Grounded
                </span>
              </div>

              {/* Citation Matrix Grid */}
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

          {/* AI Action Toolbar: Copy, Sound, Thumbs Up, Thumbs Down, Share */}
          <div className="flex items-center justify-between gap-4 mt-3 pt-2.5 border-t border-white/15 text-xs">
            {formattedTime && (
              <span className="text-[10px] text-emerald-200/70 font-mono">
                {formattedTime}
              </span>
            )}

            <div className="flex items-center gap-1 text-emerald-100">
              {/* Copy Button (Functional) */}
              <button
                type="button"
                onClick={handleCopyContent}
                aria-label="Copy AI response"
                title="Copy response"
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-100/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus:ring-1 focus:ring-white"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-300" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>

              {/* Sound Audio Synthesis Button (Modal Trigger) */}
              <button
                type="button"
                onClick={() => onTriggerFeatureModal("Neural Voice Synthesis")}
                aria-label="Listen to response"
                title="Play audio narrative"
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-100/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus:ring-1 focus:ring-white"
              >
                <Volume2 className="h-3.5 w-3.5" />
              </button>

              {/* Thumbs Up Button (Modal Trigger) */}
              <button
                type="button"
                onClick={() => onTriggerFeatureModal("Model RLHF Reinforcement (Thumbs Up)")}
                aria-label="Positive feedback"
                title="Helpful response"
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-100/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus:ring-1 focus:ring-white"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>

              {/* Thumbs Down Button (Modal Trigger) */}
              <button
                type="button"
                onClick={() => onTriggerFeatureModal("Model RLHF Correction (Thumbs Down)")}
                aria-label="Negative feedback"
                title="Report issue"
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-100/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus:ring-1 focus:ring-white"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>

              {/* Share Button (Modal Trigger) */}
              <button
                type="button"
                onClick={() => onTriggerFeatureModal("Export Diagnostic Telemetry & Share")}
                aria-label="Share telemetry report"
                title="Share telemetry"
                className="inline-flex items-center justify-center rounded-lg p-1.5 text-emerald-100/80 hover:text-white hover:bg-white/15 transition-colors focus:outline-none focus:ring-1 focus:ring-white"
              >
                <Share2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
