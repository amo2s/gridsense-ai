"use client";

import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, ChevronDown, Check, Activity, Search } from "lucide-react";
import { useFeederStore } from "@/store/feeder-store";

export interface FeederOption {
  id: string;
  name: string;
  substation: string;
  voltageClass: string;
  status: "STABLE" | "VULNERABLE" | "HIGH_RISK";
}

export const KNOWN_FEEDERS: FeederOption[] = [
  {
    id: "FDR-001",
    name: "North Corridor Feeder",
    substation: "Substation Alpha",
    voltageClass: "33kV",
    status: "STABLE",
  },
  {
    id: "FDR-002",
    name: "Central Commercial Feeder",
    substation: "Substation Beta",
    voltageClass: "11kV",
    status: "STABLE",
  },
  {
    id: "FDR-003",
    name: "East Grid Feeder",
    substation: "Substation Gamma",
    voltageClass: "33kV",
    status: "VULNERABLE",
  },
  {
    id: "FDR-004",
    name: "Industrial Heavy Feeder",
    substation: "Delta Industrial",
    voltageClass: "33kV",
    status: "HIGH_RISK",
  },
  {
    id: "FDR-005",
    name: "South Suburban Feeder",
    substation: "Epsilon Metro",
    voltageClass: "11kV",
    status: "HIGH_RISK",
  },
];

interface FeederSelectorProps {
  isExpanded: boolean;
  className?: string;
}

export default function FeederSelector({ isExpanded, className = "" }: FeederSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeFeederId = useFeederStore((state) => state.activeFeederId);
  const setActiveFeeder = useFeederStore((state) => state.setActiveFeeder);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Close dropdown on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // If sidebar collapses while dropdown is open, automatically close it
  useEffect(() => {
    if (!isExpanded) {
      setIsOpen(false);
    }
  }, [isExpanded]);

  const activeFeeder =
    KNOWN_FEEDERS.find((f) => f.id === activeFeederId) || {
      id: activeFeederId || "FDR-001",
      name: "Grid Telemetry Feeder",
      substation: "Primary Substation",
      voltageClass: "33kV",
      status: "STABLE" as const,
    };

  const filteredFeeders = KNOWN_FEEDERS.filter(
    (f) =>
      f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      f.substation.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div ref={dropdownRef} className={`relative select-none ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        title={`Active Grid Asset: ${activeFeeder.id} (${activeFeeder.name})`}
        className={`group relative flex items-center transition-all duration-300 rounded-2xl border ${
          isExpanded
            ? "w-full p-2.5 bg-white/60 hover:bg-white/90 border-white/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.9),_0_2px_8px_rgba(0,0,0,0.02)]"
            : "w-12 h-12 justify-center mx-auto bg-white/60 hover:bg-white/90 border-white/80 shadow-sm"
        }`}
      >
        {/* Specular edge highlight */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />

        {/* Left Icon with Live Status Dot */}
        <div className="relative shrink-0 flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-white/90 to-emerald-50/60 border border-emerald-100 shadow-[inset_0_1px_0_rgba(255,255,255,1)]">
          <Zap className="w-4 h-4 text-[#10b981] drop-shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
          <span
            className={`absolute -top-1 -right-1 w-2 h-2 rounded-full border border-white ${
              activeFeeder.status === "STABLE"
                ? "bg-[#10b981] animate-pulse"
                : activeFeeder.status === "VULNERABLE"
                ? "bg-amber-500"
                : "bg-red-500 animate-ping"
            }`}
          />
        </div>

        {/* Expanded Content Label */}
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -6 }}
            transition={{ duration: 0.2 }}
            className="flex-1 min-w-0 ml-3 text-left"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold tracking-[0.16em] text-slate-400">
                ACTIVE GRID ASSET
              </span>
              <span className="text-[10px] font-mono font-medium text-slate-500">
                {activeFeeder.voltageClass}
              </span>
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="font-semibold text-xs text-slate-800 truncate font-mono">
                {activeFeeder.id}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-emerald-600" : ""
                }`}
              />
            </div>
          </motion.div>
        )}
      </button>

      {/* Liquid Glass Dropdown Popover */}
      <AnimatePresence>
        {isOpen && isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            className="absolute left-0 right-0 top-full z-[100] mt-2 rounded-2xl liquid-panel bg-white/95 backdrop-blur-2xl border border-white/80 shadow-[0_16px_40px_rgba(0,0,0,0.14),_inset_0_1px_1px_rgba(255,255,255,0.9)] overflow-hidden"
          >
            {/* Header / Search */}
            <div className="p-2.5 border-b border-slate-100/80 bg-white/40">
              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Asset Selector</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-700 font-semibold uppercase tracking-wider">
                  Sync Active
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter feeders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50/80 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-700 placeholder-slate-400"
                />
              </div>
            </div>

            {/* Feeder Options List */}
            <div className="max-h-56 overflow-y-auto p-1.5 space-y-1">
              {filteredFeeders.length === 0 ? (
                <div className="py-4 text-center text-xs text-slate-400 font-medium">
                  No matching grid feeders
                </div>
              ) : (
                filteredFeeders.map((feeder) => {
                  const isSelected = feeder.id === activeFeederId;

                  return (
                    <button
                      key={feeder.id}
                      type="button"
                      onClick={() => {
                        setActiveFeeder(feeder.id);
                        setIsOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-xl transition-all duration-200 flex items-center justify-between border ${
                        isSelected
                          ? "bg-emerald-50/80 border-emerald-200 shadow-[inset_0_1px_0_rgba(255,255,255,1)]"
                          : "hover:bg-slate-100/70 border-transparent hover:border-slate-200/40"
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0">
                        <div
                          className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${
                            feeder.status === "STABLE"
                              ? "bg-emerald-500"
                              : feeder.status === "VULNERABLE"
                              ? "bg-amber-500"
                              : "bg-red-500"
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-mono text-xs font-semibold ${
                                isSelected ? "text-emerald-950 font-bold" : "text-slate-800"
                              }`}
                            >
                              {feeder.id}
                            </span>
                            <span className="text-[9px] px-1 py-0.2 rounded bg-slate-100 text-slate-500 font-mono">
                              {feeder.voltageClass}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 truncate">
                            {feeder.name}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <div className="shrink-0 p-0.5 rounded-full bg-emerald-500 text-white shadow-sm ml-1.5">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer Summary */}
            <div className="px-3 py-1.5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
              <span>Engines A & B Context</span>
              <span className="font-mono text-emerald-600 font-semibold">sessionStorage</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
