"use client";
import React, { useState, useEffect } from 'react';

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
  const [displayText, setDisplayText] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const finalTitle = 'INTERVENTION & DISPATCH CONSOLE';

  useEffect(() => {
    let iteration = 0;
    const chars = '01X@#%&*';
    const interval = setInterval(() => {
      setDisplayText((prev) => {
        return finalTitle.split('').map((letter, index) => {
          if (index < iteration) {
            return finalTitle[index];
          }
          if (letter === ' ') return ' ';
          return chars[Math.floor(Math.random() * chars.length)];
        }).join('');
      });
      iteration += 1;
      if (iteration >= finalTitle.length) {
        clearInterval(interval);
      }
    }, 30);
    return () => clearInterval(interval);
  }, [finalTitle]);

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

  useEffect(() => {
    const handleWs = () => {
      setIsReceiving(true);
      setTimeout(() => setIsReceiving(false), 500);
    };
    window.addEventListener('websocket-message', handleWs);
    return () => window.removeEventListener('websocket-message', handleWs);
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
          <span className="text-[10px] text-emerald-300 font-mono">Operations Sync: Active | Live Queue</span>
        </div>
      </div>

      <div className="relative z-10">
        <span className="text-emerald-300 text-xs font-mono uppercase tracking-widest block mb-3">
          {displayText}
        </span>
        <h1 className="text-white text-3xl font-bold tracking-tight">
          Field Dispatch & Operator Interventions
        </h1>
        
        {/* Quick Action / Metrics Row */}
        <div className="flex gap-4 mt-6">
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px] backdrop-blur-md">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Pending</span>
            <span className="text-white text-2xl font-bold">{pendingCount}</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px] backdrop-blur-md">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Active</span>
            <span className="text-white text-2xl font-bold">{activeCount}</span>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-lg p-3 flex flex-col justify-center items-center min-w-[140px] backdrop-blur-md">
            <span className="text-emerald-300/80 text-xs font-mono uppercase">Resolved</span>
            <span className="text-white text-2xl font-bold">{resolvedCount}</span>
          </div>
        </div>
      </div>

      {/* Waveform Visualizer */}
      <div className="absolute bottom-6 right-8 flex items-end gap-1 h-8 z-10">
        {[1, 2, 3, 4, 5].map((i) => (
          <div 
            key={i} 
            className={`w-1 rounded-t-sm transition-colors duration-500 ${isReceiving ? 'bg-amber-400' : 'bg-emerald-500 animate-pulse'}`}
            style={{ 
              height: !isMounted ? `${i * 20}%` : `${20 + Math.random() * 80}%`, 
              animationDelay: `${i * 100}ms` 
            }}
          />
        ))}
      </div>
    </div>
  );
}
