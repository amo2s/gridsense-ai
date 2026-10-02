import React from 'react';

export default function OperatorGreetingSkeleton() {
  return (
    <div className="bg-[#F8FAF8]/70 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden mb-8 animate-pulse">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-3xl"></div>
      <div className="relative z-10">
        <div className="h-6 w-48 bg-gray-200/50 rounded-md mb-3"></div>
        <div className="h-10 w-64 bg-gray-200/50 rounded-md mb-4"></div>
        <div className="space-y-2">
          <div className="h-4 w-full max-w-md bg-gray-200/50 rounded-md"></div>
          <div className="h-4 w-3/4 max-w-sm bg-gray-200/50 rounded-md"></div>
        </div>
      </div>
    </div>
  );
}
