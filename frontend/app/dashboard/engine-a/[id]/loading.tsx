import React from 'react';

export default function LoadingFeederDetail() {
  return (
    <div className="p-6 min-h-screen bg-[#FAFAFA] flex flex-col gap-6">
      {/* Navigation skeleton */}
      <div className="w-full">
        <div className="h-10 w-40 bg-zinc-200/60 rounded-xl animate-pulse"></div>
      </div>

      {/* Top Command Header Skeleton */}
      <div className="liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl animate-pulse">
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center relative z-10">
          <div>
            <div className="h-8 w-64 bg-zinc-200/60 rounded-md mb-2"></div>
            <div className="h-4 w-48 bg-zinc-200/60 rounded-md"></div>
          </div>
          <div className="mt-4 sm:mt-0">
            <div className="h-8 w-24 bg-zinc-200/60 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Grid skeleton designed for vertical timeline and wide predictive chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        {/* Vertical Timeline Skeleton Wrapper */}
        <div className="lg:col-span-4 liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl min-h-[600px] animate-pulse">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
          <div className="h-6 w-40 bg-zinc-200/60 rounded-md mb-6 relative z-10"></div>
          <div className="flex flex-col gap-4 relative z-10">
             {[1, 2, 3, 4].map(i => (
               <div key={i} className="flex gap-4">
                 <div className="w-12 h-12 rounded-full bg-zinc-200/60 flex-shrink-0"></div>
                 <div className="flex-1 h-24 bg-zinc-200/60 rounded-xl"></div>
               </div>
             ))}
          </div>
        </div>

        {/* Predictive Chart Skeleton Wrapper */}
        <div className="lg:col-span-8 liquid-panel backdrop-blur-md relative overflow-hidden p-6 bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)] rounded-3xl min-h-[600px] animate-pulse">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
          <div className="h-6 w-56 bg-zinc-200/60 rounded-md mb-6 relative z-10"></div>
          <div className="w-full h-[400px] bg-zinc-200/60 rounded-2xl relative z-10"></div>
        </div>
      </div>
    </div>
  );
}
