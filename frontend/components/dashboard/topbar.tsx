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
    
    const firstName = name ? name.split(" ")[0] : "Nwaka";
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
      if (path === "engine-a") {
        formattedPath = "Reliability";
      } else if (path === "engine-b") {
        formattedPath = "Engine B";
      } else if (path === "engine-c") {
        formattedPath = "Engine C";
      } else if (path === "engine-d") {
        formattedPath = "Engine D";
      } else if (path === "ingestion") {
        formattedPath = "Ingest";
      } else if (index > 0 && paths[index - 1] === "engine-a") {
        // Dynamic area ID segments
        formattedPath = `Area ${path.substring(0, 4).toUpperCase()}`;
      }
      
      return (
        <div key={path} className="flex items-center">
          <span className={`${isLast ? "text-emerald-800 font-medium" : "text-slate-400"}`}>
            {formattedPath}
          </span>
          {!isLast && <ChevronRight className="h-3 w-3 mx-1 text-slate-300" />}
        </div>
      );
    });
  };

  // Dynamic Layout Page Title Resolution (Compact)
  const getDynamicPageTitle = () => {
    if (pageTitle) return pageTitle;
    if (pathname.includes("/dashboard/ingestion/engine-d")) {
      return "Engine D: Batch Staging";
    }
    if (pathname === "/dashboard/engine-d" || pathname.startsWith("/dashboard/engine-d")) {
      return "Engine D: Prioritization";
    }
    if (pathname.includes("/dashboard/ingestion/engine-c")) {
      return "Engine C: Telemetry Ingest";
    }
    if (pathname === "/dashboard/engine-c" || pathname.startsWith("/dashboard/engine-c")) {
      return "Engine C: Anomaly Intelligence";
    }
    if (pathname.includes("/dashboard/ingestion/engine-b")) {
      return "Engine B: Telemetry Ingest";
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
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/50 bg-white/75 backdrop-blur-xl shrink-0">
      <div className="flex h-14 w-full flex-row items-center justify-between gap-4 px-4 sm:px-6">
        
        {/* Left side: Branding, Active Asset Badge, Title & Breadcrumbs */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          {/* Brand Logo & Name */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center">
              <Image
                src="/gridsense-logo.png"
                alt="GridSense Logo"
                width={18}
                height={18}
                className="drop-shadow-xs"
                style={{ width: "auto", height: "auto" }}
              />
            </div>
            <span className="whitespace-nowrap text-sm font-bold text-emerald-950 tracking-tight">
              GridSense AI
            </span>
          </div>

          {/* Dynamic Grid Asset Status Badge from Zustand Store (Compact text-[10px]) */}
          {!isHydrated || !activeFeeder ? (
            <div className="h-6 w-28 animate-pulse bg-slate-100 rounded-full border border-slate-200/60" />
          ) : isEngineDRoute ? (
            <div className="px-2.5 py-0.5 text-[10px] bg-slate-100/90 backdrop-blur-md rounded-full border border-slate-200/80 text-slate-700 font-medium flex items-center gap-1.5 shrink-0 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0" />
              <span className="font-semibold text-slate-700">Multiple Feeders (Engine D Batch View)</span>
            </div>
          ) : (
            <div className="px-2.5 py-0.5 text-[10px] bg-white/90 backdrop-blur-md rounded-full border border-emerald-200/70 text-emerald-900 font-medium flex items-center gap-1.5 shrink-0 shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold">{activeFeeder.name}</span>
              <span className="text-emerald-700/70 font-normal">({activeFeeder.substation})</span>
            </div>
          )}

          {/* Compact Inline Title, Breadcrumbs & Greeting (Merged into Single Compact Row) */}
          <div className="hidden lg:flex items-center gap-2 border-l border-slate-200/80 pl-3 min-w-0">
            <h1 className="text-xs font-semibold text-slate-800 tracking-tight truncate shrink-0">
              {getDynamicPageTitle()}
            </h1>
            <span className="text-slate-300 text-xs shrink-0">•</span>
            <div className="flex items-center text-[10px] shrink-0">
              {generateBreadcrumbs()}
            </div>
            <span className="text-slate-300 text-xs shrink-0">•</span>
            <span className="text-[10px] text-slate-400 truncate shrink-0">
              {greeting}
            </span>
          </div>
        </div>

        {/* Right side: Search, Telemetry Stream, Alerts Notification, User Profile */}
        <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
          
          {/* Global Search (Compact h-8) */}
          <div className="relative group hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
              <Search className="h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-600 transition-colors" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              className="w-40 xl:w-52 pl-8 pr-9 h-8 rounded-lg bg-slate-100/80 border border-slate-200/80 
                         text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-1 
                         focus:ring-emerald-500/40 focus:bg-white transition-all shadow-2xs"
            />
            <div className="absolute inset-y-0 right-0 pr-1.5 flex items-center pointer-events-none">
              <span className="flex items-center text-[9px] font-mono text-slate-400 bg-white/80 px-1 py-0.5 rounded border border-slate-200">
                <Command className="h-2.5 w-2.5 mr-0.5" /> K
              </span>
            </div>
          </div>

          {/* Telemetry Stream Status Badge (Compact) */}
          <div className="hidden sm:flex items-center">
            {wsStatus === "Connected" ? (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50/90 border border-emerald-200/70 shadow-2xs select-none">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-[10px] font-semibold text-emerald-800">Live</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 bg-emerald-50/80 border border-emerald-200/70 px-2 py-0.5 rounded-full shadow-2xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                <span className="text-[10px] font-medium text-emerald-700">Stable</span>
              </div>
            )}
          </div>

          {/* Intelligent Notification Hub (Compact h-8 w-8) */}
          <div className="relative">
            <button
              ref={bellButtonRef}
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative flex items-center justify-center h-8 w-8 rounded-lg hover:bg-slate-100 text-slate-600 hover:text-slate-900 transition-colors focus:outline-none focus:ring-1 focus:ring-emerald-500/30"
              aria-label={`Grid Alerts (${unreadCriticalCount} critical unread, ${totalUnreadCount} total)`}
              aria-expanded={isNotificationsOpen}
            >
              {/* Framer Motion Hardware-Accelerated Rhythmic Pulse Animation on Unread Critical Alerts */}
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
                  className={`h-4 w-4 transition-colors ${
                    unreadCriticalCount > 0 ? "text-rose-600 drop-shadow-xs" : "text-slate-600"
                  }`}
                />
              </motion.div>

              {/* Dynamic Crimson Notification Badge */}
              {unreadCriticalCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute -top-0.5 -right-0.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-rose-600 border border-white flex items-center justify-center pointer-events-none shadow-xs"
                >
                  <span className="text-[8px] font-bold font-mono text-white leading-none">
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

          {/* User Profile Dropdown (Compact h-7 w-7 Avatar) */}
          <div className="relative">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-emerald-500/20 transition-all focus:outline-none"
            >
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200 shadow-2xs">
                {name.charAt(0).toUpperCase()}
              </div>
            </button>

            {/* Profile Dropdown Panel */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 6, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-2 w-52 bg-white/95 backdrop-blur-xl border border-slate-200/80 rounded-2xl shadow-lg overflow-hidden z-50"
                >
                  <div className="p-3 border-b border-slate-100 bg-slate-50/50">
                    <p className="text-xs font-semibold text-slate-800 truncate">
                      {name}
                    </p>
                    <p className="text-[10px] text-slate-500 capitalize mt-0.5">
                      {normalizedRole.toLowerCase()}
                    </p>
                  </div>
                  
                  <div className="p-1.5">
                    <button className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 transition-colors">
                      <UserCircle className="h-3.5 w-3.5" />
                      Account Settings
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700 transition-colors mt-0.5"
                    >
                      <LogOut className="h-3.5 w-3.5" />
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
