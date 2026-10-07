"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { 
  LayoutDashboard, 
  ClipboardList,
  Activity,
  Database,
  ChevronDown
} from "lucide-react";

interface SidebarProps {
  email: string;
  role: string;
}

// Configuration for Navigation Links
const MENU_ITEMS = [
  { name: "Dashboard", icon: LayoutDashboard, path: "/dashboard", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Requests", icon: ClipboardList, path: "/dashboard/requests", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { name: "Reliability Intelligence", icon: Activity, path: "/dashboard/engine-a", roles: ["ADMIN", "MANAGER", "STAFF"] },
  { 
    name: "Data Ingestion", 
    icon: Database, 
    path: "/dashboard/ingestion", 
    roles: ["ADMIN", "MANAGER", "STAFF"],
    submenu: [
      { name: "Engine A", path: "/dashboard/ingestion/engine-a" },
      { name: "Engine B", path: "/dashboard/ingestion/engine-b" },
      { name: "Engine C", path: "/dashboard/ingestion/engine-c" }
    ]
  },
];

export default function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  // Normalize role to ensure robust matching (e.g., "Admin" becomes "ADMIN")
  const normalizedRole = role?.toUpperCase() || "STAFF";

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  useEffect(() => {
    if (pathname.startsWith('/dashboard/ingestion')) {
      setOpenAccordion('Data Ingestion');
    }
  }, [pathname]);

  // Prevent hydration mismatch on initial render
  if (!isMounted) return null;

  const allowedRoutes = MENU_ITEMS.filter(item => item.roles.includes(normalizedRole));

  return (
    <div className="w-[80px] shrink-0 m-4 h-[calc(100vh-2rem)] relative z-50">
      <motion.aside
        onMouseEnter={() => setIsExpanded(true)}
        onMouseLeave={() => setIsExpanded(false)}
        initial={false}
        animate={{ width: isExpanded ? 260 : 80 }}
        transition={{ type: "spring", stiffness: 350, damping: 30 }}
        className="absolute top-0 left-0 h-full flex flex-col justify-between liquid-panel shadow-[0_8px_32px_rgba(0,0,0,0.1)] overflow-hidden"
      >
        {/* Top Section */}
      <div className="flex flex-col gap-6 p-4 pt-8 overflow-hidden h-full">
        {/* Navigation Links */}
        <nav className="flex flex-col gap-3 mt-4">
          {allowedRoutes.map((item) => {
            const isActive = item.submenu 
              ? pathname.startsWith(item.path)
              : pathname === item.path || pathname.startsWith(`${item.path}/`);
              
            const isAccordionOpen = openAccordion === item.name;

            return (
              <div key={item.name}>
                {item.submenu ? (
                  // Accordion Parent
                  <div 
                    onClick={() => setOpenAccordion(isAccordionOpen ? null : item.name)}
                    className="cursor-pointer relative block"
                  >
                    <div
                      className={`relative z-10 group flex items-center justify-between rounded-xl px-3 py-3 transition-colors duration-300 border ${
                        isActive
                          ? "text-neutral-900 border-transparent font-semibold"
                          : "text-zinc-600 border-transparent hover:bg-white/10 hover:border-white/10 hover:text-emerald-600 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <item.icon className={`h-5 w-5 shrink-0 transition-all ${
                          isActive 
                            ? "text-[#10b981] drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
                            : ""
                        }`} />
                        <AnimatePresence initial={false}>
                          {isExpanded && (
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
                      {isExpanded && (
                        <motion.div
                          animate={{ rotate: isAccordionOpen ? 180 : 0 }}
                          transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
                        >
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </motion.div>
                      )}
                    </div>
                  </div>
                ) : (
                  // Normal Link
                  <Link href={item.path} className="relative block">
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
                        {isExpanded && (
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
                )}

                {/* Submenu */}
                {item.submenu && isExpanded && (
                  <AnimatePresence initial={false}>
                    {isAccordionOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ type: "spring", stiffness: 350, damping: 30, mass: 0.8 }}
                        className="overflow-hidden"
                      >
                        <div className="flex flex-col gap-1 mt-1 pl-[3.25rem] pr-2 pb-2">
                          {item.submenu.map((subItem) => {
                            const isSubActive = pathname === subItem.path;
                            return (
                              <Link key={subItem.path} href={subItem.path} className="relative block">
                                {isSubActive && (
                                  <motion.div
                                    layoutId="submenu-active"
                                    className="absolute inset-0 rounded-r-md bg-white/20 border-l-2 border-emerald-500 bg-gradient-to-r from-white/30 to-transparent"
                                    initial={false}
                                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                                  />
                                )}
                                <div className={`relative z-10 px-3 py-2 text-sm rounded-r-md transition-colors ${
                                  isSubActive 
                                    ? "text-emerald-600 font-semibold" 
                                    : "text-zinc-500 hover:text-emerald-500 hover:bg-white/10"
                                }`}>
                                  {subItem.name}
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}
              </div>
            );
          })}
        </nav>
      </div>
      </motion.aside>
    </div>
  );
}