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

interface TopbarProps {
  email: string;
  role: string;
  name: string;
}

export default function Topbar({ email, role, name }: TopbarProps) {
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [greeting, setGreeting] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  
  const wsStatus = useUIStore((state) => state.wsStatus);
  const [isSynthetic, setIsSynthetic] = useState(false);
  
  // Real-time alerts counter state
  const [unreadAlertsCount, setUnreadAlertsCount] = useState(3);

  // Normalize role
  const normalizedRole = role.toUpperCase();
  const displayEmail = email;

  // 1. Time-Aware Greeting Logic
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 18) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

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
      const formattedPath = path.charAt(0).toUpperCase() + path.slice(1);
      
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

  const handleLogout = () => {
    // Basic sign out for now
    window.location.href = "/portal";
  };

  return (
    <header className="sticky top-4 z-40 w-full px-4 pt-4 mb-4">
      <div className="flex items-center justify-between px-6 py-3 liquid-panel">
        
        {/* Left side: Branding & Breadcrumbs */}
        <div className="flex items-center gap-8">
          {/* Brand Logo/Header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center bg-transparent">
              <Image src="/gridsense-logo.png" alt="GridSense Logo" width={24} height={24} className="drop-shadow-md" />
            </div>
            <span className="whitespace-nowrap text-xl font-bold text-emerald-900 tracking-tight">
              GridSense AI
            </span>
            <div className="ml-2 px-3 py-1 text-sm bg-gray-100 rounded-full border border-gray-200 text-emerald-800 font-medium">
              Global View
            </div>
          </div>

          <div className="hidden lg:flex flex-col border-l border-emerald-100 pl-8">
            <h2 className="text-sm font-medium text-emerald-900/60">
              {greeting}
            </h2>
            <div className="flex items-center text-sm mt-0.5">
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

          {/* Data Governance Badge */}
          <div 
            onClick={() => setIsSynthetic(!isSynthetic)}
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-white/60 shadow-sm cursor-pointer select-none"
            title="Double-click to toggle data mode"
          >
            {isSynthetic ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
                </span>
                <span className="text-xs font-semibold text-cyan-800">Synthetic Data</span>
              </>
            ) : wsStatus === "Connected" ? (
              <>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-emerald-800">Real Data</span>
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3 text-amber-500" />
                <span className="text-xs font-semibold text-amber-700">Degraded / Stale</span>
              </>
            )}
          </div>

          {/* Intelligent Notification Hub */}
          <div className="relative">
            <button 
              onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
              className="relative p-2 rounded-xl hover:bg-white/50 transition-colors border border-transparent hover:border-white/60 text-emerald-800"
            >
              <Bell className="h-5 w-5" />
              {unreadAlertsCount > 0 && (
                <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 border border-white flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{unreadAlertsCount}</span>
                </span>
              )}
            </button>

            {/* Liquid Glass Dropdown Panel - Notifications */}
            <AnimatePresence>
              {isNotificationsOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute right-0 mt-3 w-80 liquid-panel overflow-hidden"
                >
                  <div className="p-4 border-b border-white/40 flex items-center justify-between bg-white/30">
                    <h3 className="font-semibold text-emerald-900">Alerts</h3>
                    <button className="text-xs font-medium text-emerald-600 hover:text-emerald-700">Mark all read</button>
                  </div>
                  
                  <div className="max-h-80 overflow-y-auto p-2 bg-white/20">
                    <div className="p-3 rounded-xl hover:bg-white/60 transition-colors flex gap-3 cursor-pointer">
                      <div className="mt-0.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-emerald-900">Grid Monitoring Active</p>
                        <p className="text-xs text-emerald-700/70 mt-0.5">Telemetry streams are connected.</p>
                        <p className="text-[10px] text-emerald-600/50 mt-1">Just now</p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
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
