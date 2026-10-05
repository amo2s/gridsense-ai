"use client";
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

interface RequestsGreetingProps {
  pendingCount?: number;
  activeCount?: number;
  resolvedCount?: number;
}

export default function RequestsGreeting({ 
  pendingCount = 0, 
  activeCount = 0, 
  resolvedCount = 0 
}: RequestsGreetingProps) {
  const [timeStr, setTimeStr] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric'
      }) + ' | ' + now.toLocaleTimeString('en-US');
      setTimeStr(formatted + ' WAT'); 
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-teal-900 to-teal-950 border border-white/10 shadow-[0_8px_32px_rgba(4,43,21,0.4)] p-8 mb-8">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-400/20 rounded-full blur-[80px] pointer-events-none" />

      {/* Top Right Container */}
      <div className="absolute top-6 right-8 flex flex-col items-end gap-2 z-10">
        <div className="text-emerald-100/70 text-xs font-mono">{timeStr}</div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="text-[10px] text-emerald-300 font-mono">Admin Sync: Active</span>
        </div>
      </div>

      <div className="relative z-10">
        <span className="text-emerald-300 text-xs font-mono uppercase tracking-widest block mb-3">
          ACCOUNT APPROVALS & ROLE MANAGEMENT
        </span>
        <h1 className="text-white text-3xl font-bold tracking-tight">
          Staff Access Requests
        </h1>
        
        {/* Quick Action / Metrics Row */}
        <div className="flex gap-4 mt-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px]">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Pending</span>
            <span className="text-white text-2xl font-bold">{pendingCount}</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px]">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Active</span>
            <span className="text-white text-2xl font-bold">{activeCount}</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px]">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Processed</span>
            <span className="text-white text-2xl font-bold">{resolvedCount}</span>
          </div>
        </div>
        
        <Button onClick={() => window.location.reload()} className="mt-4 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30">
          Sync Access Logs
        </Button>
      </div>
    </div>
  );
}
