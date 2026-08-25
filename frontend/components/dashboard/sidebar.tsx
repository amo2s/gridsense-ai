"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  Users, 
  Activity, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  LogOut
} from "lucide-react";

interface SidebarProps {
  email: string;
  role: string;
}

// Configuration for role-based access
const MENU_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Staff Requests", icon: Users, path: "/dashboard/requests", roles: ["ADMIN"] },
  { name: "Grid Telemetry", icon: Activity, path: "/dashboard/telemetry", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Settings", icon: Settings, path: "/dashboard/settings", roles: ["ADMIN", "MANAGER"] },
];

export default function Sidebar({ email, role }: SidebarProps) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Normalize role to ensure robust matching (e.g., "Admin" becomes "ADMIN")
  const normalizedRole = role?.toUpperCase() || "STAFF";

  // Handle hydration and localStorage sync
  useEffect(() => {
    setIsMounted(true);
    const storedState = localStorage.getItem("sidebarCollapsed");
    if (storedState) {
      setIsCollapsed(JSON.parse(storedState));
    }
  }, []);

  const toggleSidebar = () => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    localStorage.setItem("sidebarCollapsed", JSON.stringify(newState));
  };

  // Prevent hydration mismatch on initial render
  if (!isMounted) return null;

  const allowedRoutes = MENU_ITEMS.filter(item => item.roles.includes(normalizedRole));

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 280 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="relative h-screen z-50 flex flex-col justify-between 
                 bg-gradient-to-br from-white/40 to-white/10 backdrop-blur-2xl 
                 border-r border-white/60 shadow-[4px_0_32px_rgba(21,128,61,0.08)]"
    >
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-4 top-8 flex h-8 w-8 items-center justify-center rounded-full 
                   bg-green-600 text-white shadow-lg hover:bg-green-700 transition-colors"
      >
        {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Top Section */}
      <div className="flex flex-col gap-6 p-4 pt-8 overflow-hidden">
        {/* Brand Logo/Header */}
        <div className="flex items-center gap-3 px-2 mb-4 h-10">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600 shadow-[0_0_15px_rgba(22,163,74,0.5)]">
            <Activity className="h-6 w-6 text-white" />
          </div>
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="whitespace-nowrap text-xl font-bold text-green-900"
              >
                GridSense AI
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Links */}
        <nav className="flex flex-col gap-2">
          {allowedRoutes.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={`group flex items-center gap-4 rounded-xl px-3 py-3 transition-all duration-300 ${
                    isActive
                      ? "bg-green-600 shadow-[0_4px_20px_rgba(22,163,74,0.3)] text-white"
                      : "text-green-800 hover:bg-white/50 hover:text-green-900"
                  }`}
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  <AnimatePresence initial={false}>
                    {!isCollapsed && (
                      <motion.span
                        initial={{ opacity: 0, width: 0 }}
                        animate={{ opacity: 1, width: "auto" }}
                        exit={{ opacity: 0, width: 0 }}
                        className="whitespace-nowrap font-medium overflow-hidden"
                      >
                        {item.name}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section (User Info & Logout) */}
      <div className="p-4 mb-4 overflow-hidden border-t border-white/40">
        <div className="flex items-center gap-3 px-2">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-700 font-bold border border-green-200">
            {email ? email.charAt(0).toUpperCase() : "U"}
          </div>
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-col overflow-hidden whitespace-nowrap"
              >
                <span className="text-sm font-semibold text-green-900 truncate">
                  {email || "Unknown User"}
                </span>
                <span className="text-xs text-green-700 capitalize">
                  {normalizedRole.toLowerCase()}
                </span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        <button className="mt-4 flex w-full items-center gap-4 rounded-xl px-3 py-3 text-red-500 hover:bg-red-50 hover:text-red-600 transition-colors">
          <LogOut className="h-5 w-5 shrink-0" />
          <AnimatePresence initial={false}>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="whitespace-nowrap font-medium"
              >
                Sign Out
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}