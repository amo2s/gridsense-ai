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

  // 4. Context-Aware Breadcrumbs Generator
  const generateBreadcrumbs = () => {
    const paths = pathname.split("/").filter((p) => p !== "");
    return paths.map((path, index) => {
      const isLast = index === paths.length - 1;
      let formattedPath = path.charAt(0).toUpperCase() + path.slice(1).replace(/-/g, " ");
      
      // Dynamic Nomenclature Dictionary
      if (path === "engine-a") {
        formattedPath = "Reliability Intelligence";
      } else if (path === "engine-b") {
        formattedPath = "Engine B: Outage-Risk Intelligence";
      } else if (path === "engine-c") {
        formattedPath = "Engine C: Anomaly Intelligence";
      } else if (index > 0 && paths[index - 1] === "engine-a") {
        // Handle dynamic [id] segments gracefully instead of rendering raw UUIDs
        formattedPath = `Area Details: ${path.substring(0, 6).toUpperCase()}`;
      }
      
      return (
        <div key={path} className="flex items-center">
          <span className={`${isLast ? "text-emerald-800 font-semibold" : "text-emerald-600/70"}`}>
            {formattedPath}
          </span>
          {!isLast && <ChevronRight className="h-4 w-4 mx-2 text-emerald-600/40" />}
        </div>
      );
    });
  };

  // Dynamic Layout Page Title Resolution
  const getDynamicPageTitle = () => {
    if (pageTitle) return pageTitle;
    if (pathname === "/dashboard/engine-c" || pathname.startsWith("/dashboard/engine-c")) {
      return "Engine C: Anomaly Intelligence";
    }
    if (pathname.includes("/dashboard/ingestion/engine-c")) {
      return "Engine C: Telemetry Ingestion";
    }
    if (pathname === "/dashboard/engine-b" || pathname.startsWith("/dashboard/engine-b")) {
      return "Engine B: Outage-Risk Intelligence";
    }
    if (pathname.includes("/dashboard/ingestion/engine-b")) {
      return "Engine B: Telemetry Ingestion";
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
    <header className="sticky top-4 z-40 w-full pr-4 pl-0 md:pr-6 md:pl-2 pt-4 mb-4">
      <div className="flex items-center justify-between px-6 py-3 bg-white/20 backdrop-blur-2xl bg-gradient-to-br from-white/60 via-white/10 to-white/5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.8),inset-1px_-1px_3px_rgba(255,255,255,0.1)] shadow-[0_16px_40px_-8px_rgba(15,23,42,0.15)] rounded-3xl border border-white/40">
        
        {/* Left side: Branding & Breadcrumbs */}
        <div className="flex items-center gap-8">
          {/* Brand Logo/Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-transparent">
              <Image src="/gridsense-logo.png" alt="GridSense Logo" width={24} height={24} className="drop-shadow-md" style={{ width: "auto", height: "auto" }} />
            </div>
            <span className="whitespace-nowrap text-xl font-bold text-emerald-900 tracking-tight">
              GridSense AI
            </span>
            {/* Dynamic Grid Asset Status Badge from Zustand Store */}
            {!isHydrated || !activeFeeder ? (
              <div className="ml-2 h-7 w-40 animate-pulse bg-white/10 rounded border border-white/10" />
            ) : (
              <div className="ml-2 px-3 py-1 text-xs bg-white/60 backdrop-blur-md rounded-full border border-white/80 text-emerald-900 font-medium flex items-center gap-1.5 shadow-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="font-semibold">{activeFeeder.name}</span>
                <span className="text-emerald-700/70 font-normal text-[11px]">({activeFeeder.substation})</span>
              </div>
            )}
          </div>

          <div className="hidden lg:flex flex-col border-l border-emerald-100 pl-8">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-emerald-950 tracking-tight">
                {getDynamicPageTitle()}
              </h1>
              <span className="text-xs text-emerald-900/50">
                • {greeting}
              </span>
            </div>
            <div className="flex items-center text-xs mt-0.5">
              {generateBreadcrumbs()}
            </div>
          </div>
        </div>

        {/* Right side: Search, Health, Notifications, Profile */}
        <div className="flex items-center gap-5">
          
          {/* Global Search */}
          <div className="relative group hidden md:block">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-emerald-700/50 group-focus-within:text-emerald-600 transition-colors" />
            </div>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search..."
              className="w-64 pl-10 pr-12 py-2 rounded-xl bg-white/50 border border-white/60 
                         text-emerald-900 placeholder-emerald-700/50 focus:outline-none focus:ring-2 
                         focus:ring-emerald-500/30 focus:bg-white transition-all shadow-inner"
            />
            <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
              <span className="flex items-center text-[10px] font-medium text-emerald-700/50 bg-white/60 px-1.5 py-0.5 rounded border border-emerald-700/10">
                <Command className="h-3 w-3 mr-0.5" /> K
              </span>
            </div>
          </div>

          {/* Telemetry Stream Status Badge */}
          <div className="hidden sm:flex items-center">
            {wsStatus === "Connected" ? (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-white/60 shadow-xs select-none">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-emerald-800">Live Telemetry</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded-md shadow-xs">
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                <span className="text-xs font-semibold text-emerald-700">System Stable</span>
              </div>
            )}
          </div>

          {/* Intelligent Notification Hub (Step 4.2) */}
          <div className="relative">
            <button
              ref={bellButtonRef}
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2 rounded-xl hover:bg-white/50 transition-colors border border-transparent hover:border-white/60 text-emerald-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
              aria-label={`Grid Alerts (${unreadCriticalCount} critical unread, ${totalUnreadCount} total)`}
              aria-expanded={isNotificationsOpen}
            >
              {/* Framer Motion Hardware-Accelerated Rhythmic Pulse Animation on Unread Critical Alerts */}
              <motion.div
                animate={
                  unreadCriticalCount > 0
                    ? {
                        scale: [1, 1.22, 0.94, 1.15, 1],
                        rotate: [0, -14, 14, -10, 10, 0],
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
                  className={`h-5 w-5 transition-colors ${
                    unreadCriticalCount > 0 ? "text-rose-600 drop-shadow-sm" : "text-emerald-800"
                  }`}
                />
              </motion.div>

              {/* Dynamic Absolutely Positioned Crimson Notification Badge */}
              {unreadCriticalCount > 0 && (
                <motion.span
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-rose-600 border border-white shadow-[0_0_8px_rgba(225,29,72,0.7)] flex items-center justify-center pointer-events-none"
                >
                  <span className="text-[9px] font-bold font-mono text-white leading-none">
                    {unreadCriticalCount > 99 ? "99+" : unreadCriticalCount}
                  </span>
                </motion.span>
              )}
            </button>

            {/* Liquid Glass Dropdown Panel - Live Redis Alerts Stream */}
            <AlertDropdown
              isOpen={isNotificationsOpen}
              onClose={() => setIsNotificationsOpen(false)}
              triggerRef={bellButtonRef}
            />
          </div>

          {/* User Profile Dropdown */}
          <div className="relative ml-2">
            <button 
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className="flex items-center gap-2 p-1 pl-2 pr-3 rounded-full hover:bg-white/50 transition-colors border border-transparent hover:border-white/60"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 font-bold border border-emerald-200">
                {name.charAt(0).toUpperCase()}
              </div>
            </button>

            {/* Liquid Glass Dropdown Panel - Profile */}
            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-3 w-56 liquid-panel overflow-hidden"
                >
                  <div className="p-4 border-b border-white/40 bg-white/30">
                    <p className="text-sm font-semibold text-emerald-900 truncate">
                      {name}
                    </p>
                    <p className="text-xs text-emerald-700 capitalize mt-0.5">
                      {normalizedRole.toLowerCase()}
                    </p>
                  </div>
                  
                  <div className="p-2 bg-white/20">
                    <button className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-emerald-800 hover:bg-white/60 transition-colors">
                      <UserCircle className="h-4 w-4" />
                      Account Settings
                    </button>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors mt-1"
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
