import React from 'react';

export default function AreaLoading() {
  return (
    <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 min-h-screen bg-[#FAFAFA]">
      <div className="col-span-full lg:col-span-12 mb-4">
        <div className="h-10 w-48 rounded-xl bg-white/5 animate-pulse" />
      </div>

      <div className="col-span-full lg:col-span-4 rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-6 flex flex-col space-y-6">
        <div className="h-6 w-1/2 bg-white/5 animate-pulse rounded-md" />
        <div className="h-64 w-full bg-white/5 animate-pulse rounded-3xl" />
      </div>

      <div className="col-span-full lg:col-span-8 rounded-3xl bg-white/60 shadow-xl shadow-emerald-900/5 border border-white/80 p-6 flex flex-col space-y-6 min-h-[500px]">
        <div className="h-6 w-1/3 bg-white/5 animate-pulse rounded-md" />
        <div className="flex-1 w-full bg-white/5 animate-pulse rounded-3xl" />
      </div>
    </main>
  );
}
