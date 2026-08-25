"use client";

import { useState, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Search, 
  Bell, 
  Command, 
  ChevronRight,
  CheckCircle2,
  AlertCircle
} from "lucide-react";

interface TopbarProps {
  email: string;
  role: string;
}

export default function Topbar({ email, role }: TopbarProps) {
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  
  const [greeting, setGreeting] = useState("");
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [systemHealth, setSystemHealth] = useState<"connecting" | "optimal" | "offline">("connecting");
  const [hasUnread, setHasUnread] = useState(true); // Set to true for UI testing

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

  // 3. Live System Health Polling via Proxy
  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Routed through your Next.js proxy to hit Go's /healthz
        const res = await fetch("/api/proxy/healthz");
        if (res.ok) {
          setSystemHealth("optimal");
        } else {
          setSystemHealth("offline");
        }
      } catch (error) {
        setSystemHealth("offline");
      }
    };

    // Initial check
    checkHealth();
    // Poll every 60 seconds
    const interval = setInterval(checkHealth, 60000);
    return () => clearInterval(interval);
  }, []);

  // 4. Context-Aware Breadcrumbs Generator
  const generateBreadcrumbs = () => {
    const paths = pathname.split("/").filter((p) => p !== "");
    return paths.map((path, index) => {
      const isLast = index === paths.length - 1;
      const formattedPath = path.charAt(0).toUpperCase() + path.slice(1);
      
      return (
        <div key={path} className="flex items-center">
          <span className={`${isLast ? "text-green-800 font-semibold" : "text-green-600/70"}`}>
            {formattedPath}
          </span>
          {!isLast && <ChevronRight className="h-4 w-4 mx-2 text-green-600/40" />}
        </div>
      );
    });
  };

  return (
    <header 
      className="sticky top-0 z-40 w-full flex items-center justify-between px-6 py-4 
                 bg-gradient-to-r from-white/40 to-white/10 backdrop-blur-2xl 
                 border-b border-white/60 shadow-[0_4px_32px_rgba(21,128,61,0.03)]"
    >
      {/* Left side: Greeting & Breadcrumbs */}
      <div className="flex flex-col">
        <h2 className="text-xl font-bold text-green-900 tracking-tight">
          {greeting}, <span className="capitalize">{role.toLowerCase()}</span>
        </h2>
        <div className="flex items-center text-sm mt-1">
          {generateBreadcrumbs()}
        </div>
      </div>

      {/* Right side: Search, Health, Notifications */}
      <div className="flex items-center gap-6">
        
        {/* Global Search */}
        <div className="relative group hidden md:block">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-green-700/50 group-focus-within:text-green-600 transition-colors" />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
            className="w-64 pl-10 pr-12 py-2 rounded-xl bg-white/50 border border-white/60 
                       text-green-900 placeholder-green-700/50 focus:outline-none focus:ring-2 
                       focus:ring-green-500/30 focus:bg-white transition-all shadow-inner"
          />
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
            <span className="flex items-center text-[10px] font-medium text-green-700/50 bg-white/60 px-1.5 py-0.5 rounded border border-green-700/10">
              <Command className="h-3 w-3 mr-0.5" /> K
            </span>
          </div>
        </div>

        {/* Live System Health Indicator */}
        <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/50 border border-white/60 shadow-sm">
          {systemHealth === "optimal" ? (
            <>
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              <span className="text-xs font-semibold text-green-800">System Optimal</span>
            </>
          ) : systemHealth === "connecting" ? (
            <>
              <div className="h-2.5 w-2.5 rounded-full bg-yellow-400 animate-pulse"></div>
              <span className="text-xs font-semibold text-yellow-700">Connecting...</span>
            </>
          ) : (
            <>
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span className="text-xs font-semibold text-red-600">Degraded</span>
            </>
          )}
        </div>

        {/* Intelligent Notification Hub */}
        <div className="relative">
          <button 
            onClick={() => setIsNotificationsOpen(!isNotificationsOpen)}
            className="relative p-2 rounded-xl hover:bg-white/50 transition-colors border border-transparent hover:border-white/60 text-green-800"
          >
            <Bell className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute top-1.5 right-1.5 h-2.5 w-2.5 rounded-full bg-red-500 border-2 border-white"></span>
            )}
          </button>

          {/* Liquid Glass Dropdown Panel */}
          <AnimatePresence>
            {isNotificationsOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 mt-3 w-80 rounded-2xl bg-white/80 backdrop-blur-3xl 
                           border border-white shadow-[0_10px_40px_rgba(21,128,61,0.1)] overflow-hidden"
              >
                <div className="p-4 border-b border-green-100/50 flex items-center justify-between bg-white/50">
                  <h3 className="font-semibold text-green-900">Notifications</h3>
                  <button className="text-xs font-medium text-green-600 hover:text-green-700">Mark all read</button>
                </div>
                
                <div className="max-h-80 overflow-y-auto p-2">
                  {/* Placeholder for future alerts - keeping it clean for now */}
                  <div className="p-3 rounded-xl hover:bg-white/60 transition-colors flex gap-3 cursor-pointer">
                    <div className="mt-0.5">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-900">Grid Monitoring Active</p>
                      <p className="text-xs text-green-700/70 mt-0.5">Telemetry streams are connected.</p>
                      <p className="text-[10px] text-green-600/50 mt-1">Just now</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}