import React from 'react';

export default function OperatorGreetingSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-900 via-teal-900 to-teal-950 border border-white/10 shadow-[0_8px_32px_rgba(4,43,21,0.4)] p-8 mb-8 animate-pulse">
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-emerald-400/20 rounded-full blur-[80px] pointer-events-none" />
      <div className="relative z-10">
        <div className="h-4 w-48 bg-emerald-800/50 rounded-md mb-3"></div>
        <div className="h-10 w-64 bg-emerald-800/50 rounded-md mb-6"></div>
        <div className="flex gap-3">
          <div className="h-10 w-24 bg-emerald-800/50 rounded-lg"></div>
          <div className="h-10 w-32 bg-emerald-800/50 rounded-lg"></div>
          <div className="h-10 w-48 bg-emerald-800/50 rounded-lg"></div>
        </div>
      </div>
    </div>
  );
}
