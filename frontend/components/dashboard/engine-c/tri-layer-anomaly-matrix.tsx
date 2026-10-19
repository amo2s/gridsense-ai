"use client";

import React from "react";
import { motion, Variants } from "framer-motion";
import isEqual from "fast-deep-equal";
import {
  Layers,
  Activity,
  Calendar,
  Cpu,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  ShieldCheck,
  ShieldAlert,
  Zap,
  TrendingUp,
  Sliders,
} from "lucide-react";
import {
  AnomalySeverity,
  LayerFlags,
} from "@/types/engine-c-anomaly";

export interface TriLayerAnomalyMatrixProps {
  layerFlags: LayerFlags;
  confidenceScore: number; // 0.0 to 1.0
  severity: AnomalySeverity;
  riskScore: number; // 0 to 100
  isAnomaly: boolean;
  activeFeederId?: string;
  inferenceLatencyMs?: number;
}

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

const subCardVariants: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 280,
      damping: 22,
    },
  },
};

/**
 * ============================================================================
 * TRI-LAYER ANOMALY MATRIX COMPONENT (BLUEPRINT STEP 3.1)
 * ============================================================================
 * Maps Engine C's three mathematical detection layers:
 *  - Layer 1: Statistical Median Absolute Deviation (MAD) Point Outlier
 *  - Layer 2: Seasonal-Trend Decomposition (STL) Residual Drift
 *  - Layer 3: Multivariate Isolation Forest / PyOD Ensemble Flag
 *
 * Enforces strict color polarity & accessibility contract:
 *  - LOW / Stable: Emerald Semantic Tokens
 *  - MEDIUM / HIGH: Amber Semantic Tokens
 *  - CRITICAL: Crimson / Rose Semantic Tokens
 *
 * Utilizes subtle spring physics with Framer Motion and strict Liquid Glass styling.
 * Wrapped in React.memo using fast-deep-equal (Blueprint Step 3.5).
 */
function TriLayerAnomalyMatrixComponent({
  layerFlags,
  confidenceScore,
  severity,
  riskScore,
  isAnomaly,
  activeFeederId = "",
  inferenceLatencyMs = 0,
}: TriLayerAnomalyMatrixProps) {
  // Severity classification mapping
  const normalizedSeverity: AnomalySeverity =
    severity === "CRITICAL"
      ? "CRITICAL"
      : severity === "HIGH"
      ? "HIGH"
      : severity === "MEDIUM"
      ? "MEDIUM"
      : "LOW";

  // Master visual status style matrix
  const getSeverityBadgeStyles = (sev: AnomalySeverity) => {
    switch (sev) {
      case "CRITICAL":
        return {
          textClass: "text-rose-600",
          badgeBg: "bg-rose-500/15 text-rose-800 border-rose-500/35",
          dotColor: "bg-rose-500",
          pulse: "animate-pulse",
          label: "CRITICAL BREACH",
          icon: AlertOctagon,
        };
      case "HIGH":
      case "MEDIUM":
        return {
          textClass: "text-amber-700",
          badgeBg: "bg-amber-500/15 text-amber-800 border-amber-500/35",
          dotColor: "bg-amber-500",
          pulse: "",
          label: sev === "HIGH" ? "HIGH WARNING" : "ELEVATED RISK",
          icon: AlertTriangle,
        };
      case "LOW":
      default:
        return {
          textClass: "text-emerald-700",
          badgeBg: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
          dotColor: "bg-emerald-500",
          pulse: "",
          label: "NOMINAL BASELINE",
          icon: CheckCircle2,
        };
    }
  };

  const getLayerCardStyles = (isTriggered: boolean, layerSev: AnomalySeverity) => {
    if (!isTriggered) {
      return {
        cardBorder: "border-emerald-500/20",
        cardBg: "bg-gradient-to-br from-emerald-500/5 via-white/50 to-white/20",
        badge: "bg-emerald-500/10 text-emerald-700 border border-emerald-500/20",
        statusText: "NOMINAL",
        dotColor: "bg-emerald-500",
        shadow: "shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_4px_20px_-4px_rgba(16,185,129,0.08)]",
        iconClass: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20",
      };
    }

    if (layerSev === "CRITICAL") {
      return {
        cardBorder: "border-rose-500/40",
        cardBg: "bg-gradient-to-br from-rose-500/15 via-white/60 to-white/25",
        badge: "bg-rose-500/20 text-rose-800 border-rose-500/40",
        statusText: "TRIGGERED",
        dotColor: "bg-rose-500 animate-ping",
        shadow: "shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_0_30px_rgba(244,63,94,0.2)]",
        iconClass: "text-rose-600 bg-rose-500/15 border-rose-500/30",
      };
    }

    return {
      cardBorder: "border-amber-500/35",
      cardBg: "bg-gradient-to-br from-amber-500/10 via-white/60 to-white/20",
      badge: "bg-amber-500/15 text-amber-800 border-amber-500/30",
      statusText: "ELEVATED",
      dotColor: "bg-amber-500",
      shadow: "shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9),inset_-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_0_25px_rgba(245,158,11,0.14)]",
      iconClass: "text-amber-600 bg-amber-500/15 border-amber-500/30",
    };
  };

  const badgeStyles = getSeverityBadgeStyles(normalizedSeverity);
  const BadgeIcon = badgeStyles.icon;

  const l1Styles = getLayerCardStyles(layerFlags.layer1_stat, normalizedSeverity);
  const l2Styles = getLayerCardStyles(layerFlags.layer2_seas, normalizedSeverity);
  const l3Styles = getLayerCardStyles(layerFlags.layer3_multi, normalizedSeverity);

  const activeTriggersCount = [
    layerFlags.layer1_stat,
    layerFlags.layer2_seas,
    layerFlags.layer3_multi,
  ].filter(Boolean).length;

  return (
    <div className="w-full bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40 p-6">
      {/* Container Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200/60 mb-6">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-2 rounded-xl bg-slate-900 text-white shadow-xs">
              <Layers className="w-4 h-4 text-emerald-400" />
            </div>
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-slate-900">
              Tri-Layer Anomaly Detection Matrix
            </h2>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold font-mono border ${badgeStyles.badgeBg} ${badgeStyles.pulse}`}>
              <span className={`w-2 h-2 rounded-full ${badgeStyles.dotColor}`} />
              <BadgeIcon className="w-3.5 h-3.5" />
              <span>{badgeStyles.label}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 pl-9">
            Multivariate Inference Engine &bull; Layered Point-Outlier, Seasonal Residual & Ensemble Isolation
          </p>
        </div>

        {/* Aggregate Inference Metric Badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 shadow-2xs text-xs font-mono">
            <span className="text-slate-400 mr-1.5">Active Triggers:</span>
            <span className={`font-bold ${activeTriggersCount > 0 ? "text-amber-700" : "text-emerald-700"}`}>
              {activeTriggersCount} / 3 Layers
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 shadow-2xs text-xs font-mono">
            <span className="text-slate-400 mr-1.5">Confidence:</span>
            <span className="font-bold text-slate-800">
              {(confidenceScore * 100).toFixed(0)}%
            </span>
          </div>

          <div className="px-3 py-1.5 rounded-xl bg-white/60 border border-white/80 shadow-2xs text-xs font-mono">
            <span className="text-slate-400 mr-1.5">Latency:</span>
            <span className="font-bold text-slate-800">{inferenceLatencyMs.toFixed(1)}ms</span>
          </div>
        </div>
      </div>

      {/* Tri-Layer Grid Sub-Cards */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="grid grid-cols-1 md:grid-cols-3 gap-5"
      >
        {/* Layer 1: Statistical Median Absolute Deviation (MAD) */}
        <motion.div
          variants={subCardVariants}
          className={`rounded-2xl border ${l1Styles.cardBorder} ${l1Styles.cardBg} ${l1Styles.shadow} backdrop-blur-xl p-5 flex flex-col h-full justify-between transition-colors`}
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl border ${l1Styles.iconClass}`}>
                  <Activity className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Detection Layer 1
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Statistical Point MAD
                  </h3>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${l1Styles.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${l1Styles.dotColor}`} />
                {l1Styles.statusText}
              </span>
            </div>
          </div>

          <div className="mt-auto pt-3.5 border-t border-slate-200/50 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-500">
              <span>Threshold Mode:</span>
              <span className="text-slate-800 font-semibold">&gt; 3.5 MAD Outliers</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Mathematical Guard:</span>
              <span className={layerFlags.layer1_stat ? "text-rose-600 font-semibold" : "text-emerald-700 font-semibold"}>
                {layerFlags.layer1_stat ? "Variance Exceeded" : "Nominal Variance"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Layer 2: Seasonal-Trend Decomposition (STL) */}
        <motion.div
          variants={subCardVariants}
          className={`rounded-2xl border ${l2Styles.cardBorder} ${l2Styles.cardBg} ${l2Styles.shadow} backdrop-blur-xl p-5 flex flex-col h-full justify-between transition-colors`}
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl border ${l2Styles.iconClass}`}>
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Detection Layer 2
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Seasonal STL Residual
                  </h3>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${l2Styles.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${l2Styles.dotColor}`} />
                {l2Styles.statusText}
              </span>
            </div>
          </div>

          <div className="mt-auto pt-3.5 border-t border-slate-200/50 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-500">
              <span>Diurnal Envelope:</span>
              <span className="text-slate-800 font-semibold">&plusmn; 3&sigma; Confidence Band</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Residual Drift:</span>
              <span className={layerFlags.layer2_seas ? "text-amber-700 font-semibold" : "text-emerald-700 font-semibold"}>
                {layerFlags.layer2_seas ? "Drift Breach Flagged" : "Within Envelope"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* Layer 3: Multivariate Machine Learning Isolation (PyOD) */}
        <motion.div
          variants={subCardVariants}
          className={`rounded-2xl border ${l3Styles.cardBorder} ${l3Styles.cardBg} ${l3Styles.shadow} backdrop-blur-xl p-5 flex flex-col h-full justify-between transition-colors`}
        >
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl border ${l3Styles.iconClass}`}>
                  <Cpu className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                    Detection Layer 3
                  </span>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                    Multivariate Isolation
                  </h3>
                </div>
              </div>

              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border ${l3Styles.badge}`}>
                <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${l3Styles.dotColor}`} />
                {l3Styles.statusText}
              </span>
            </div>
          </div>

          <div className="mt-auto pt-3.5 border-t border-slate-200/50 space-y-1.5 text-[11px] font-mono">
            <div className="flex items-center justify-between text-slate-500">
              <span>Model Architecture:</span>
              <span className="text-slate-800 font-semibold">Isolation Forest Ensemble</span>
            </div>
            <div className="flex items-center justify-between text-slate-500">
              <span>Coupled Anomaly:</span>
              <span className={layerFlags.layer3_multi ? "text-rose-600 font-semibold" : "text-emerald-700 font-semibold"}>
                {layerFlags.layer3_multi ? "Multi-Axis Outlier" : "Coupled Nominal"}
              </span>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/**
 * Render Optimization: Wrapped in React.memo using fast-deep-equal (Blueprint Step 3.5)
 * Prevents re-renders during 30s polling ticks when values have not mathematically changed.
 */
export const TriLayerAnomalyMatrix = React.memo(
  TriLayerAnomalyMatrixComponent,
  (prevProps, nextProps) => isEqual(prevProps, nextProps)
);

export default TriLayerAnomalyMatrix;
