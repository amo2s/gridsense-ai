"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";

export interface PageTransitionProps {
  children: React.ReactNode;
  pageTitle?: string;
}

export function PageTransition({ children, pageTitle }: PageTransitionProps) {
  const pathname = usePathname();

  // Dynamic layout title system
  const dynamicTitle =
    pageTitle ||
    (pathname === "/dashboard/engine-b" || pathname.startsWith("/dashboard/engine-b")
      ? "Engine B: Outage-Risk Intelligence"
      : pathname.includes("/dashboard/ingestion/engine-b")
      ? "Engine B: Telemetry Ingestion"
      : pathname.includes("/dashboard/engine-a")
      ? "Engine A: Reliability Intelligence"
      : "Grid Operations Console");
  
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -15 }}
        transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
        className="w-full h-full"
        data-layout-title={dynamicTitle}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
