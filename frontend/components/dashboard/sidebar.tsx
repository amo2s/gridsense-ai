"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  ClipboardList,
  ChevronLeft, 
  ChevronRight,
  Cpu
} from "lucide-react";

interface SidebarProps {
  email: string;
  role: string;
}

// Configuration for Navigation Links
const MENU_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Requests", icon: ClipboardList, path: "/dashboard/requests", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Engine A", icon: Cpu, path: "/dashboard/engine-a", roles: ["ADMIN", "MANAGER", "STAFF"] },
];

export default function Sidebar({ role }: SidebarProps) {
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
      animate={{ width: isCollapsed ? 80 : 260 }}
      transition={{ type: "spring", stiffness: 200, damping: 25 }}
      className="relative z-50 flex flex-col justify-between m-4 liquid-panel h-[calc(100vh-2rem)]"
    >
      {/* Toggle Button */}
      <button
        onClick={toggleSidebar}
        className="absolute -right-4 top-8 flex h-8 w-8 items-center justify-center rounded-full 
                   bg-white text-emerald-600 shadow-md hover:bg-emerald-50 transition-colors border border-emerald-100"
      >
        {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
      </button>

      {/* Top Section */}
      <div className="flex flex-col gap-6 p-4 pt-8 overflow-hidden h-full">
        {/* Navigation Links */}
        <nav className="flex flex-col gap-3 mt-4">
          {allowedRoutes.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(`${item.path}/`);
            return (
              <Link key={item.path} href={item.path} className="relative block">
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-indicator"
                    className="absolute inset-0 rounded-xl bg-white/60 backdrop-blur-sm border border-white/80 shadow-[inset_0_1px_0_rgba(255,255,255,1),_0_4px_6px_rgba(0,0,0,0.02)]"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div
                  className={`relative z-10 group flex items-center gap-4 rounded-xl px-3 py-3 transition-colors duration-300 border ${
                    isActive
                      ? "text-neutral-900 border-transparent font-semibold"
                      : "text-zinc-600 border-transparent hover:bg-white/10 hover:border-white/10 hover:text-emerald-600 hover:shadow-sm"
                  }`}
                >
                  <item.icon className={`h-5 w-5 shrink-0 transition-all ${
                    isActive 
                      ? "text-[#10b981] drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                      : ""
                  }`} />
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
    </motion.aside>
  );
}