"use client";

import React, { useEffect } from 'react';

export default function AreaError({ error, reset }: { error: Error & { digest?: string }, reset: () => void }) {
  useEffect(() => {
    console.error("Area telemetry error:", error);
  }, [error]);

  return (
    <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-screen bg-[#FAFAFA]">
      <div className="col-span-full flex flex-col items-center justify-center min-h-[500px] rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-8">
        <div className="flex flex-col items-center justify-center p-8 rounded-3xl border border-white/10 bg-white/5 shadow-sm text-center">
          <p className="text-zinc-600 font-medium mb-6">Failed to load area telemetry. Please check the backend connection.</p>
          <button 
            onClick={() => reset()}
            className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors shadow-sm shadow-emerald-500/20"
          >
            Retry
          </button>
        </div>
      </div>
    </main>
  );
}
