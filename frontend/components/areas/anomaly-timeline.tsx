import React from 'react';

export interface AnomalyTimelineEvent {
  id: string;
  areaId: string;
  eventType: string;
  severity: string;
  timestamp: string;
  description: string;
}

interface AnomalyTimelineProps {
  data?: AnomalyTimelineEvent[];
}

export function AnomalyTimeline({ data = [] }: AnomalyTimelineProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 w-full flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 shadow-sm">
        <p className="text-sm font-medium text-zinc-500">No active anomalies</p>
      </div>
    );
  }

  const formatTime = (ts: string) => {
    try {
      const date = new Date(ts);
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
      }).format(date);
    } catch {
      return ts;
    }
  };

  const getSeverityColor = (severity: string) => {
    const s = severity.toLowerCase();
    if (s === 'high' || s === 'critical') return '#f59e0b'; // Amber (or Red)
    if (s === 'low' || s === 'normal') return '#10b981'; // Emerald
    return '#10b981'; // Default Emerald
  };

  return (
    <div className="relative py-4">
      {/* Spine */}
      <div className="absolute left-[11px] top-4 bottom-4 w-[2px] bg-emerald-500" />
      
      <div className="space-y-6">
        {data.map((event) => (
          <div key={event.id} className="relative group flex items-start">
            {/* SVG Marker */}
            <div className="absolute left-0 top-3 flex h-6 w-6 items-center justify-center bg-transparent z-10">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <circle cx="6" cy="6" r="6" fill={getSeverityColor(event.severity)} />
              </svg>
            </div>
            
            {/* Card */}
            <div className="ml-10 flex-1 rounded-2xl bg-white/5 border border-white/10 shadow-sm p-4 transition-all duration-300 group-hover:border-emerald-500/50 group-hover:translate-x-1">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-zinc-700 tracking-tight">{event.eventType}</span>
                <span className="text-xs font-semibold text-zinc-400">{formatTime(event.timestamp)}</span>
              </div>
              <p className="text-sm text-zinc-500 leading-relaxed">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
