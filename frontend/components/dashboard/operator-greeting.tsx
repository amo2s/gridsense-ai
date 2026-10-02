import React from 'react';

interface OperatorGreetingProps {
  name: string;
  role: string;
}

export default function OperatorGreeting({ name, role }: OperatorGreetingProps) {
  const normalizedRole = role?.toLowerCase() || 'staff';
  const isAdmin = normalizedRole === 'admin' || normalizedRole === 'superadmin';
  const title = isAdmin ? 'Administrator Command Console' : 'Grid Analyst Terminal';

  return (
    <div className="bg-[#F8FAF8]/70 backdrop-blur-2xl border border-white/60 shadow-[0_8px_32px_rgba(0,0,0,0.04)] rounded-2xl p-6 relative overflow-hidden mb-8">
      <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-400/20 rounded-full blur-3xl"></div>
      <div className="relative z-10">
        <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-3 text-emerald-800 border border-emerald-200">
          {title}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight capitalize text-emerald-950">
          Welcome back, {name}
        </h1>
        <p className="mt-2 text-emerald-800/80 max-w-xl text-sm leading-relaxed">
          Live telemetry synchronized via edge proxy. Monitoring real-time grid reliability, infrastructure anomalies, and priority network sectors.
        </p>
      </div>
    </div>
  );
}
