"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Building2, 
  CheckSquare, 
  Square, 
  Play, 
  Layers, 
  Search, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Database,
  ArrowRight,
  ShieldCheck,
  Check
} from "lucide-react";
import { toast } from "sonner";
import { useEngineDStore, DEFAULT_ENGINE_D_AREA_ID } from "@/store/engine-d-store";
import { useFeeders } from "@/hooks/use-feeders";
import { FALLBACK_FEEDERS, FeederOption } from "@/components/dashboard/feeder-selector";
import { Button } from "@/components/ui/button";

export const PREDEFINED_GRID_AREAS = [
  {
    id: DEFAULT_ENGINE_D_AREA_ID,
    name: "Central District Sub-Grid",
    region: "Zone A (Metro Core)",
    description: "High-density urban distribution grid with redundant ring feeder topology",
  },
  {
    id: "e1f2a3b4-5c6d-7e8f-9a0b-1c2d3e4f5a6b",
    name: "Northern Industrial Sector",
    region: "Zone B (Heavy Industry)",
    description: "Dedicated high-voltage feeder cluster supplying manufacturing corridors",
  },
  {
    id: "c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f",
    name: "East Grid Substation Hub",
    region: "Zone C (Commercial)",
    description: "Commercial and healthcare continuous-power priority distribution zone",
  },
  {
    id: "f5a6b7c8-d9e0-1f2a-3b4c-5d6e7f8a9b0c",
    name: "South Suburban Network",
    region: "Zone D (Residential)",
    description: "Suburban branch feeders prone to weather-induced vegetation contact faults",
  },
];

export default function EngineDForm() {
  const router = useRouter();

  // Zustand Store Slices
  const storeActiveAreaId = useEngineDStore((state) => state.activeAreaId);
  const setActiveAreaId = useEngineDStore((state) => state.setActiveAreaId);
  const storeSelectedFeeders = useEngineDStore((state) => state.selectedFeeders);
  const setSelectedFeeders = useEngineDStore((state) => state.setSelectedFeeders);

  // Step A: Area Selection State
  const [selectedAreaId, setSelectedAreaId] = useState<string>(
    storeActiveAreaId || DEFAULT_ENGINE_D_AREA_ID
  );
  const [customAreaInput, setCustomAreaInput] = useState<string>("");

  // Step B & C: Candidate Checklist State
  const [selectedFeederIds, setSelectedFeederIds] = useState<string[]>(
    storeSelectedFeeders.length > 0 ? storeSelectedFeeders : []
  );
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // TanStack Query for live candidate feeders
  const { data: liveFeeders, isLoading: isLoadingFeeders } = useFeeders();
  const candidateFeeders: FeederOption[] = liveFeeders && liveFeeders.length > 0
    ? liveFeeders
    : FALLBACK_FEEDERS;

  // Filtered candidate feeders for the search bar
  const filteredFeeders = useMemo(() => {
    if (!searchQuery.trim()) return candidateFeeders;
    const query = searchQuery.toLowerCase();
    return candidateFeeders.filter(
      (f) =>
        f.id.toLowerCase().includes(query) ||
        f.name.toLowerCase().includes(query) ||
        f.substation.toLowerCase().includes(query)
    );
  }, [candidateFeeders, searchQuery]);

  // Checklist Selection Handlers
  const toggleFeeder = (feederId: string) => {
    const normalized = feederId.trim().toLowerCase();
    setSelectedFeederIds((prev) =>
      prev.includes(normalized)
        ? prev.filter((id) => id !== normalized)
        : [...prev, normalized]
    );
  };

  const selectAll = () => {
    const allIds = candidateFeeders.map((f) => f.id.toLowerCase());
    setSelectedFeederIds(allIds);
  };

  const deselectAll = () => {
    setSelectedFeederIds([]);
  };

  const selectHighRiskOnly = () => {
    const highRiskIds = candidateFeeders
      .filter((f) => f.status === "HIGH_RISK" || f.status === "VULNERABLE")
      .map((f) => f.id.toLowerCase());
    setSelectedFeederIds(highRiskIds);
  };

  // Validation
  const isValid = selectedFeederIds.length >= 2;

  // Step C Submission: Run Prioritization
  const handleRunPrioritization = () => {
    if (!isValid) {
      toast.error("Selection rejected: Ranking requires at least 2 candidate feeders.");
      return;
    }

    setIsSubmitting(true);

    try {
      const targetAreaId = selectedAreaId.trim() || DEFAULT_ENGINE_D_AREA_ID;

      // Update Zustand isolated store
      setActiveAreaId(targetAreaId);
      setSelectedFeeders(selectedFeederIds);

      toast.success(
        `Batch staged successfully: ${selectedFeederIds.length} candidate feeders queued for listwise ranking.`
      );

      // Programmatic navigation to Engine D dashboard
      router.push("/dashboard/engine-d");
    } catch (err: any) {
      setIsSubmitting(false);
      toast.error(err?.message || "Failed to commit candidate feeder staging.");
    }
  };

  return (
    <div className="space-y-8">
      {/* ========================================================================= */}
      {/* STEP A: GRID AREA SELECTION */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center gap-2.5 pb-2 border-b border-slate-200/60">
          <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-bold font-mono">
            A
          </div>
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">
            Select Operational Grid Area (Query Scope)
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {PREDEFINED_GRID_AREAS.map((area) => {
            const isSelected = selectedAreaId === area.id;

            return (
              <div
                key={area.id}
                onClick={() => {
                  setSelectedAreaId(area.id);
                  setCustomAreaInput("");
                }}
                className={`p-4 rounded-2xl cursor-pointer transition-all duration-200 border flex flex-col justify-between ${
                  isSelected
                    ? "bg-emerald-500/10 border-emerald-500/40 shadow-sm ring-1 ring-emerald-500/30"
                    : "bg-white/40 hover:bg-white/70 border-white/60 hover:border-slate-200"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className={`w-4 h-4 ${isSelected ? "text-emerald-700" : "text-slate-400"}`} />
                    <span className="font-semibold text-xs text-slate-800">{area.name}</span>
                  </div>
                  {isSelected && (
                    <div className="p-0.5 rounded-full bg-emerald-600 text-white shrink-0">
                      <Check className="w-3 h-3 stroke-[3]" />
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-slate-500 mt-2 leading-relaxed">
                  {area.description}
                </p>

                <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100/60 text-[10px] font-mono text-slate-400">
                  <span>{area.region}</span>
                  <span className="truncate max-w-[160px]">{area.id}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Custom Area ID Input */}
        <div className="flex items-center gap-3 p-3 rounded-xl bg-white/40 border border-white/60">
          <label htmlFor="custom-area-id" className="text-xs font-medium text-slate-600 shrink-0">
            Or Specify Area UUID:
          </label>
          <input
            id="custom-area-id"
            type="text"
            value={customAreaInput}
            onChange={(e) => {
              const val = e.target.value;
              setCustomAreaInput(val);
              if (val.trim()) {
                setSelectedAreaId(val.trim());
              }
            }}
            placeholder="e.g. 7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d"
            className="flex-1 bg-white/70 border border-slate-200/80 focus:ring-2 focus:ring-emerald-500/40 focus:bg-white rounded-lg px-3 py-1 text-xs text-slate-800 font-mono transition-all"
          />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* STEP B: CANDIDATE FEEDER CHECKLIST */}
      {/* ========================================================================= */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-2 border-b border-slate-200/60">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-6 h-6 rounded-lg bg-emerald-600 text-white text-xs font-bold font-mono">
              B
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                Candidate Feeders Checklist
              </h2>
              <p className="text-[11px] text-slate-500">
                Select the pool of grid feeders within this area to evaluate under comparative listwise ranking
              </p>
            </div>
          </div>

          {/* Quick Checklist Controls */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectAll}
              className="text-xs h-7 px-2.5 text-slate-700 bg-white/50"
            >
              Select All
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={selectHighRiskOnly}
              className="text-xs h-7 px-2.5 text-amber-800 border-amber-200/80 bg-amber-50/50 hover:bg-amber-100/50"
            >
              High-Risk Only
            </Button>
            {selectedFeederIds.length > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deselectAll}
                className="text-xs h-7 px-2.5 text-slate-500 bg-white/50"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search candidate feeders by ID, substation, or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white/60 border border-slate-200/80 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:bg-white transition-all shadow-xs"
          />
        </div>

        {/* Candidate Checklist Container */}
        {isLoadingFeeders ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
            <span className="text-xs">Loading candidate feeders from database...</span>
          </div>
        ) : filteredFeeders.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400 bg-white/30 rounded-2xl border border-white/60">
            No feeders match the search query.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[380px] overflow-y-auto p-1">
            {filteredFeeders.map((feeder) => {
              const isChecked = selectedFeederIds.includes(feeder.id.toLowerCase());

              return (
                <div
                  key={feeder.id}
                  onClick={() => toggleFeeder(feeder.id)}
                  className={`p-3 rounded-xl border cursor-pointer select-none transition-all duration-150 flex items-center justify-between gap-3 ${
                    isChecked
                      ? "bg-emerald-500/10 border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/20"
                      : "bg-white/40 hover:bg-white/70 border-white/70"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <button
                      type="button"
                      aria-checked={isChecked}
                      className="shrink-0 text-emerald-700 focus:outline-none"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-4 h-4 text-emerald-600" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-300 hover:text-slate-400" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-mono text-xs font-semibold truncate ${
                            isChecked ? "text-emerald-950 font-bold" : "text-slate-800"
                          }`}
                        >
                          {feeder.id}
                        </span>
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {feeder.voltageClass}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 truncate mt-0.5">
                        {feeder.name} • {feeder.substation}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded-full shrink-0 border ${
                      feeder.status === "STABLE"
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : feeder.status === "VULNERABLE"
                        ? "bg-amber-50 text-amber-700 border-amber-200"
                        : "bg-rose-50 text-rose-700 border-rose-200"
                    }`}
                  >
                    {feeder.status}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* STEP C: VALIDATION & SUBMISSION */}
      {/* ========================================================================= */}
      <section className="pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Validation Badge */}
        <div className="flex items-center gap-2.5">
          {isValid ? (
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-800 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 rounded-xl">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>
                {selectedFeederIds.length} Feeders Selected • Ready for comparative ranking
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-800 bg-amber-500/15 border border-amber-500/30 px-3 py-1.5 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Select at least 2 feeders to perform comparative listwise ranking (Current: {selectedFeederIds.length})
              </span>
            </div>
          )}
        </div>

        {/* Action Button */}
        <Button
          type="button"
          size="default"
          variant="default"
          disabled={!isValid || isSubmitting}
          isLoading={isSubmitting}
          onClick={handleRunPrioritization}
          className="bg-emerald-700 hover:bg-emerald-800 text-white px-6 shadow-sm disabled:opacity-50"
        >
          <Play className="w-4 h-4 mr-1.5 fill-current" />
          <span>Run Prioritization ({selectedFeederIds.length})</span>
        </Button>
      </section>
    </div>
  );
}
