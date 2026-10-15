"use client";

import React, { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Bell,
  Check,
  Trash2,
  Zap,
  Clock,
  ShieldAlert,
  X,
} from "lucide-react";
import { useAlertStore, GridAlert } from "@/store/alert-store";

export interface AlertDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Humanizes an ISO timestamp into localized relative time (e.g., "Just now", "2m ago", "1h ago").
 */
function formatRelativeTime(isoString: string): string {
  try {
    const eventTime = new Date(isoString).getTime();
    const now = Date.now();
    const diffSeconds = Math.max(0, Math.floor((now - eventTime) / 1000));

    if (diffSeconds < 15) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;

    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  } catch {
    return "Recently";
  }
}

/**
 * Maps severity to strict GridSense visual polarity classes and icons.
 */
function getSeverityConfig(severity: string, isCritical: boolean) {
  const norm = severity.toUpperCase();

  if (isCritical || norm === "CRITICAL" || norm === "HIGH") {
    return {
      borderClass: "border-rose-500/40",
      bgClass: "bg-rose-500/10 hover:bg-rose-500/15",
      badgeClass: "bg-rose-500/20 text-rose-800 border-rose-500/30",
      textClass: "text-rose-950",
      iconColor: "text-rose-600",
      glowClass: "shadow-[0_0_12px_rgba(244,63,94,0.25)]",
      Icon: AlertOctagon,
      label: norm === "HIGH" ? "HIGH RISK" : "CRITICAL",
    };
  }

  if (norm === "MEDIUM" || norm === "WARNING") {
    return {
      borderClass: "border-amber-500/40",
      bgClass: "bg-amber-500/10 hover:bg-amber-500/15",
      badgeClass: "bg-amber-500/20 text-amber-800 border-amber-500/30",
      textClass: "text-amber-950",
      iconColor: "text-amber-600",
      glowClass: "shadow-[0_0_12px_rgba(245,158,11,0.2)]",
      Icon: AlertTriangle,
      label: "WARNING",
    };
  }

  return {
    borderClass: "border-emerald-500/40",
    bgClass: "bg-emerald-500/10 hover:bg-emerald-500/15",
    badgeClass: "bg-emerald-500/20 text-emerald-800 border-emerald-500/30",
    textClass: "text-emerald-950",
    iconColor: "text-emerald-600",
    glowClass: "shadow-[0_0_12px_rgba(16,185,129,0.2)]",
    Icon: CheckCircle2,
    label: norm === "RESTORED" ? "RESTORED" : "STABLE",
  };
}

/**
 * ============================================================================
 * GLOBAL ALERT DROPDOWN COMPONENT (STEP 4.2 LIQUID GLASS NOTIFICATION HUB)
 * ============================================================================
 * Houses real-time SSE alerts streaming from the Redis backend.
 * Conforms strictly to Liquid Glass aesthetics with backdrop blurring,
 * multi-stop specular gradients, and dual-layer specular inset shadows.
 */
export default function AlertDropdown({ isOpen, onClose, triggerRef }: AlertDropdownProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const alerts = useAlertStore((state) => state.alerts);
  const unreadCriticalCount = useAlertStore((state) => state.unreadCriticalCount);
  const totalUnreadCount = useAlertStore((state) => state.totalUnreadCount);
  const acknowledgeAlert = useAlertStore((state) => state.acknowledgeAlert);
  const acknowledgeAll = useAlertStore((state) => state.acknowledgeAll);
  const clearAlerts = useAlertStore((state) => state.clearAlerts);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        panelRef.current &&
        !panelRef.current.contains(target) &&
        triggerRef.current &&
        !triggerRef.current.contains(target)
      ) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose, triggerRef]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          role="dialog"
          aria-label="Grid Alerts and Live Redis Stream Notifications"
          aria-modal="true"
          initial={{ opacity: 0, y: 12, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="absolute right-0 top-full mt-3 w-96 sm:w-[440px] z-50 overflow-hidden rounded-3xl border border-white/40 bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] text-slate-800"
        >
          {/* Header */}
          <div className="p-4 border-b border-white/40 flex items-center justify-between bg-white/40 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
                <Bell className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-sm tracking-tight text-slate-900">
                    Live Grid Alerts
                  </h3>
                  {unreadCriticalCount > 0 ? (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-rose-500/20 text-rose-800 border border-rose-500/30 animate-pulse">
                      {unreadCriticalCount} CRITICAL
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-800 border border-emerald-500/30">
                      ALL NOMINAL
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500">
                  Redis stream: <span className="font-mono text-emerald-700">gridsense:alerts:stream</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {totalUnreadCount > 0 && (
                <button
                  onClick={acknowledgeAll}
                  className="px-2.5 py-1 rounded-xl bg-white/60 hover:bg-white text-xs font-semibold text-emerald-800 border border-white/80 shadow-2xs hover:shadow-xs transition-all flex items-center gap-1"
                  title="Acknowledge and mark all alerts as resolved"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Ack All</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl hover:bg-white/50 text-slate-400 hover:text-slate-700 transition-colors"
                aria-label="Close alert dropdown"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable Alert List */}
          <div className="max-h-[380px] overflow-y-auto p-3 space-y-2.5 bg-white/10">
            {alerts.length === 0 ? (
              <div className="py-12 px-4 text-center rounded-2xl bg-white/40 border border-white/60">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-bold text-slate-800">Operational Horizon Clear</p>
                <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">
                  Zero active threshold breaches or multivariate anomalies reported across monitored feeders.
                </p>
              </div>
            ) : (
              alerts.map((alert) => {
                const config = getSeverityConfig(alert.severity, alert.is_critical);
                const AlertIcon = config.Icon;
                const isAcknowledged = alert.acknowledged || alert.read;

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 rounded-2xl border transition-all ${config.borderClass} ${
                      isAcknowledged
                        ? "bg-white/40 opacity-75 hover:opacity-100"
                        : `${config.bgClass} ${config.glowClass}`
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 p-1.5 rounded-lg bg-white/70 shadow-2xs shrink-0 ${config.iconColor}`}>
                          <AlertIcon className="w-4 h-4" />
                        </div>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold uppercase border ${config.badgeClass}`}>
                              {config.label}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500 bg-white/60 px-2 py-0.5 rounded-md border border-slate-200/50">
                              Feeder: <span className="font-semibold text-slate-800">{alert.feeder_id.slice(0, 8)}</span>
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 ml-auto">
                              <Clock className="w-3 h-3" />
                              <span>{formatRelativeTime(alert.timestamp)}</span>
                            </span>
                          </div>

                          <p className={`text-xs leading-relaxed font-medium ${config.textClass}`}>
                            {alert.message}
                          </p>
                        </div>
                      </div>

                      {/* Acknowledge Button */}
                      {!isAcknowledged && (
                        <button
                          onClick={() => acknowledgeAlert(alert.id)}
                          className="shrink-0 p-1.5 rounded-lg bg-white/80 hover:bg-emerald-600 hover:text-white text-slate-600 border border-slate-200/60 shadow-2xs transition-all"
                          title="Acknowledge alert"
                          aria-label={`Acknowledge alert for feeder ${alert.feeder_id}`}
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-white/40 bg-white/40 backdrop-blur-md flex items-center justify-between text-xs text-slate-500">
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SSE Stream Active</span>
            </div>
            {alerts.length > 0 && (
              <button
                onClick={clearAlerts}
                className="text-slate-400 hover:text-rose-600 transition-colors flex items-center gap-1 text-[11px]"
              >
                <Trash2 className="w-3 h-3" />
                <span>Clear History</span>
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
