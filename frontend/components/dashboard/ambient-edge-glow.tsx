"use client";

import { useUIStore } from "@/store/ui-store";
import { motion } from "framer-motion";

export function AmbientEdgeGlow() {
  const status = useUIStore((state) => state.dataStreamStatus);
  
  let color = "#10b981"; // REAL
  if (status === "DEGRADED") color = "#f59e0b"; // Amber
  if (status === "SYNTHETIC") color = "#3b82f6"; // Holographic Blue
  
  return (
    <motion.div 
      className="absolute top-0 left-0 right-0 h-4 z-50 pointer-events-none"
      animate={{ 
        boxShadow: `inset 0 2px 15px -3px ${color}`
      }}
      transition={{ duration: 1, ease: "easeInOut" }}
    />
  );
}
