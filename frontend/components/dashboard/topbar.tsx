"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Bell, 
  Command, 
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  Activity,
  LogOut,
  UserCircle
} from "lucide-react";
import { useUIStore } from "@/store/ui-store";
import { useFeederStore } from "@/store/feeder-store";
import { useAlertStore } from "@/store/alert-store";
import { useGlobalAlertStream } from "@/hooks/use-global-alert-stream";
import AlertDropdown from "@/components/dashboard/alert-dropdown";

interface TopbarProps {
  email: string;
  role: string;
  name: string;
  pageTitle?: string;
}

export default function Topbar({ email, role, name, pageTitle }: TopbarProps) {
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bellButtonRef = useRef<HTMLButtonElement>(null);
  
  // Initialize persistent global Server-Sent Events (SSE) notification stream
  useGlobalAlertStream();

  const [greeting, setGreeting] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  
  const wsStatus = useUIStore((state) => state.wsStatus);
  
  // Real-time alerts state from global Zustand alert store (Step 4.2)
  const unreadCriticalCount = useAlertStore((state) => state.unreadCriticalCount);
  const totalUnreadCount = useAlertStore((state) => state.totalUnreadCount);

  // Active grid asset from Zustand global store
  const activeFeeder = useFeederStore((state) => state.activeFeeder);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  // Normalize role
  const normalizedRole = role.toUpperCase();
  const displayEmail = email;

  // 1. Time-Aware Greeting Logic
  useEffect(() => {
    const hour = new Date().getHours();
    let timeGreeting = "Good Morning";
    if (hour >= 12 && hour < 17) timeGreeting = "Good Afternoon";
    else if (hour >= 17) timeGreeting = "Good Evening";
    
    const firstName = name ? name.split(" ")[0] : "Amos";
    setGreeting(`${timeGreeting}, ${firstName}.`);
  }, [name]);

  // 2. Global Command Search (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);


  // 3. Health Check Polling (Removed in favor of WebSocket heartbeat)

  const isEngineDRoute = pathname?.includes("/engine-d") ?? false;

  // 4. Context-Aware Breadcrumbs Generator (Compact Inline)
  const generateBreadcrumbs = () => {
    const paths = pathname.split("/").filter((p) => p !== "");
    return paths.map((path, index) => {
      const isLast = index === paths.length - 1;
      let formattedPath = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, " ");
      
      // Dynamic Nomenclature Dictionary
      if (path === "dashboard") formattedPath = "Dashboard";
      else if (path === "engine-a") formattedPath = "Reliability";
      else if (path === "engine-b") formattedPath = "Engine B";
      else if (path === "engine-c") formattedPath = "Engine C";
      else if (path === "engine-d") formattedPath = "Engine D";
      else if (path === "ingestion") formattedPath = "Ingestion";
      else if (index > 0 && paths[index - 1] === "engine-a") {
        formattedPath = `Area ${path.substring(0, 4).toUpperCase()}`;
      }
      
      return (
        <span key={path} className="inline-flex items-center">
          <span className={isLast ? "text-emerald-800 font-medium" : "text-slate-400"}>
            {formattedPath}
          </span>
          {!isLast && <ChevronRight className="h-3 w-3 mx-1 text-slate-300 shrink-0" />}
        </span>
      );
    });
  };

  // Dynamic Layout Page Title Resolution
  const getDynamicPageTitle = () => {
    if (pageTitle) return pageTitle;
    if (pathname.includes("/dashboard/ingestion/engine-d")) {
      return "Engine D: Ingest";
    }
    if (pathname === "/dashboard/engine-d" || pathname.startsWith("/dashboard/engine-d")) {
      return "Engine D: Prioritization & Ranking";
    }
    if (pathname.includes("/dashboard/ingestion/engine-c")) {
      return "Engine C: Ingest";
    }
    if (pathname === "/dashboard/engine-c" || pathname.startsWith("/dashboard/engine-c")) {
      return "Engine C: Anomaly Intelligence";
    }
    if (pathname.includes("/dashboard/ingestion/engine-b")) {
      return "Engine B: Ingest";
    }
    if (pathname === "/dashboard/engine-b" || pathname.startsWith("/dashboard/engine-b")) {
      return "Engine B: Outage-Risk Intelligence";
    }
    if (pathname.includes("/dashboard/engine-a")) {
      return "Engine A: Reliability Intelligence";
    }
    return "Grid Operations Console";
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/proxy/auth/logout", { method: "POST" });
    } catch (e) {
      console.error(e);
    }
    window.location.href = "/portal";
  };

  return (
    <header className="w-full pr-4 pl-0 pt-4 pb-1 shrink-0 z-40">
      <div className="flex h-16 w-full items-center justify-between gap-4 px-6 liquid-panel shadow-[0_8px_32px_rgba(0,0,0,0.06)] border border-white/80 bg-white/75 backdrop-blur-xl rounded-2xl">
        
        {/* ================================================================= */}
        {/* GROUP 1: Brand & Badge Group (Top-Left Alignment) */}
        {/* ================================================================= */}
        <div className="flex items-center gap-3 shrink-0">
          {/* Logo & Brand Name */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center">
              <Image
                src="/gridsense-logo.png"
                alt="GridSense Logo"
                width={22}
                height={22}
                className="drop-shadow-xs"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <span className="whitespace-nowrap text-base font-bold text-emerald-950 tracking-tight">
              GridSense AI
            </span>
          </div>

          {/* Thin Vertical Border Divider */}
          <div className="h-4 w-[1px] bg-slate-200 shrink-0" />

          {/* Single-Line Pill Shape Badge (Never Stacked) */}
          {!isHydrated || !activeFeeder ? (
            <div className="h-7 w-36 animate-pulse bg-slate-100 rounded-full border border-slate-200/50 shrink-0" />
          ) : isEngineDRoute ? (
            <div className="px-3 py-1 bg-slate-100/80 border border-slate-200/50 rounded-full text-xs text-slate-600 font-medium whitespace-nowrap flex items-center gap-1.5 shrink-0 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0" />
              <span>Multiple Feeders (Engine D Batch View)</span>
            </div>
          ) : (
            <div className="px-3 py-1 bg-white/90 border border-emerald-200/60 rounded-full text-xs text-emerald-900 font-medium whitespace-nowrap flex items-center gap-1.5 shrink-0 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold">{activeFeeder.name}</span>
              <span className="text-emerald-700/70 font-normal">({activeFeeder.substation})</span>
            </div>
          )}
        </div>

        {/* ================================================================= */}
        {/* GROUP 2: Page Context Group (Middle Alignment) */}
        {/* ================================================================= */}
        <div className="hidden lg:flex items-center gap-3 border-l border-slate-200/80 pl-4 min-w-0">
          <div className="flex flex-col justify-center">
            {/* Page Name */}
            <h1 className="text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap">
              {getDynamicPageTitle()}
            </h1>

            {/* Breadcrumbs, Active Indicator, and Operator Greeting Inline on Single Row Below */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 mt-0.5 whitespace-nowrap">
              <div className="flex items-center">
                {generateBreadcrumbs()}
              </div>
              {isEngineDRoute && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Engine D Active
                  </span>
                </>
              )}
              <span className="text-slate-300">•</span>
              <span className="text-slate-400">
                {greeting}
              </span>
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* GROUP 3: Control Actions Group (Right Alignment) */}
        {/* ================================================================= */}
        <div className="flex items-center gap-3.5 shrink-0">
          
          {/* Global Search Input (h-9) */}
          <div className="relative group hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              className="w-44 xl:w-56 pl-9 pr-10 h-9 rounded-xl bg-slate-100/80 border border-slate-200/80 
                         text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 
                         focus:ring-emerald-500/30 focus:bg-white transition-all shadow-2xs"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
              <span className="flex items-center text-[10px] font-mono font-medium text-slate-400 bg-white px-1.5 py-0.5 rounded border border-slate-200/80">
                <Command className="h-2.5 w-2.5 mr-0.5" /> K
              </span>
            </div>
          </div>

          {/* System Stable Status Badge */}
          <div className="hidden sm:flex items-center">
            {wsStatus === "Connected" ? (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 shadow-2xs select-none">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-xs font-semibold text-emerald-800">Live Telemetry</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full shadow-2xs">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">System Stable</span>
              </div>
            )}
          </div>

          {/* Intelligent Notification Hub */}
          <div className="relative">
            <button
              ref={bellButtonRef}
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative flex items-center justify-center h-9 w-9 rounded-xl hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              aria-label={`Grid Alerts (${unreadCriticalCount} critical unread, ${totalUnreadCount} total)`}
              aria-expanded={isNotificationsOpen}
            >
              {/* Pulse Animation on Unread Alerts */}
              <motion.div
                animate={
                  unreadCriticalCount > 0
                    ? {
                        scale: [1, 1.2, 0.95, 1.15, 1],
                        rotate: [0, -12, 12, -8, 8, 0],
                        transition: {
                          duration: 2.2,
                          repeat: Infinity,
                          repeatType: "loop",
                          ease: "easeInOut",
                        },
                      }
                    : { scale: 1, rotate: 0 }
                }
                className="flex items-center justify-center"
              >
                <Bell
                  className={`h-4.5 w-4.5 transition-colors ${
                    unreadCriticalCount > 0 ? "text-rose-600" : "text-slate-600"
                  }`}
                />
              </motion.div>

              {/* Dynamic Crimson Notification Badge */}
              {unreadCriticalCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-rose-600 border border-white flex items-center justify-center pointer-events-none shadow-xs"
                >
                  <span className="text-[9px] font-bold font-mono text-white leading-none">
                    {unreadCriticalCount > 99 ? "99+" : unreadCriticalCount}
                  </span>
                </motion.span>
              )}
            </button>

            {/* Live Redis Alerts Stream Panel */}
            <AlertDropdown
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              triggerRef={bellButtonRef}
            />
          </div>

          {/* User Profile Avatar "A" */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-emerald-500/20 transition-all focus:outline-none"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                {name.charAt(0).toUpperCase()}
              </div>
            </button>

            {/* Profile Dropdown Panel */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-56 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-xl overflow-hidden z-50"
                >
                  <div className="p-3.5 border-b border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {name}
                    </p>
                    <p className="text-[10px] text-slate-500 capitalize mt-0.5">
                      {normalizedRole.toLowerCase()}
                    </p>
                  </div>
                  
                  <div className="p-1.5">
                    <button className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-slate-700 hover:bg-slate-100 transition-colors">
                      <UserCircle className="h-4 w-4 text-slate-500" />
                      Account Settings
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors mt-0.5"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign Out
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      </div>
    </header>
  );
}
