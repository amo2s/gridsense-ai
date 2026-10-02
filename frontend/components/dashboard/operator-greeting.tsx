"use client";
import React, { useState, useEffect } from 'react';

interface OperatorGreetingProps {
  name: string;
  role: string;
}

export default function OperatorGreeting({ name, role }: OperatorGreetingProps) {
  const normalizedRole = role?.toLowerCase() || 'staff';
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'superadmin';
  const finalTitle = isAdmin ? 'ADMINISTRATOR COMMAND CONSOLE' : 'GRID ANALYST TERMINAL';

  const [displayText, setDisplayText] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [isReceiving, setIsReceiving] = useState(false);
  const [isBriefOpen, setIsBriefOpen] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const fullBrief = "Grid stability is nominal at 90%. No active high-risk sectors detected. LightGBM anomaly prediction models show a 0.2% probability of feeder failure in the next 6 hours.";

  // Phase 3: Terminal Boot-Up Sequence
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

  // Phase 4: Clock
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

  // Phase 5: WebSocket Visualizer Listener
  useEffect(() => {
    const handleWs = () => {
      setIsReceiving(true);
      setTimeout(() => setIsReceiving(false), 500);
    };
    window.addEventListener('websocket-message', handleWs);
    return () => window.removeEventListener('websocket-message', handleWs);
  }, []);

  // AI Brief Typewriter
  useEffect(() => {
    if (isBriefOpen) {
      let i = 0;
      setBriefText('');
      const int = setInterval(() => {
        setBriefText(fullBrief.substring(0, i + 1));
        i++;
        if (i >= fullBrief.length) clearInterval(int);
      }, 1500 / fullBrief.length);
      return () => clearInterval(int);
    } else {
      setBriefText('');
    }
  }, [isBriefOpen]);

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
          <span className="text-[10px] text-emerald-300 font-mono">ONNX Engine: Active | Latency: 12ms | Confidence: 98.4%</span>
        </div>
      </div>

      <div className="relative z-10">
        <span className="text-emerald-300 text-xs font-mono uppercase tracking-widest block mb-3">
          {displayText}
        </span>
        <h1 className="text-white text-3xl font-bold tracking-tight capitalize">
          Welcome back, {name}
        </h1>
        
        {/* Quick Action Row */}
        <div className="flex gap-3 mt-6">
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-50 text-sm px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-300">
            System Logs
          </button>
          <button className="bg-white/5 hover:bg-white/10 border border-white/10 text-emerald-50 text-sm px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-300">
            Export Shift Report
          </button>
          <button 
            onClick={() => setIsBriefOpen(!isBriefOpen)}
            className="bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-400/30 text-emerald-50 text-sm px-4 py-2 rounded-lg backdrop-blur-md transition-all duration-300"
          >
            Generate Intelligence Brief
          </button>
        </div>

        {isBriefOpen && (
          <div className="bg-black/20 border-t border-white/10 mt-6 p-4 rounded-xl max-w-2xl">
            <p className="text-emerald-50 font-mono text-sm leading-relaxed min-h-[40px]">
              {briefText}<span className="animate-pulse">_</span>
            </p>
          </div>
        )}
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
