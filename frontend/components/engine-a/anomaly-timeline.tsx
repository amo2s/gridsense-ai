"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { graphqlClient } from "@/lib/graphql-client";
import { GET_AREA_DRILL_DOWN_METRICS } from "@/lib/graphql/queries";
import { Loader2 } from "lucide-react";

interface AnomalyTimelineProps {
  feederId: string;
}

export function AnomalyTimeline({ feederId }: AnomalyTimelineProps) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["anomaly-timeline", feederId],
    queryFn: async () => {
      const res = await graphqlClient.request<any>(GET_AREA_DRILL_DOWN_METRICS, {
        areaId: feederId,
        timeRange: "6h"
      });
      return res.anomalyTimeline;
    }
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-[#10b981]" />
      </div>
    );
  }

  if (isError || !data || data.length === 0) {
    return (
      <div className="flex justify-center items-center h-full min-h-[400px]">
        <p className="text-gray-400 font-medium">No data available</p>
      </div>
    );
  }

  return (
    <div className="relative pl-6 py-4 h-full min-h-[400px]">
      {/* Central spine of the timeline */}
      <div className="absolute top-0 bottom-0 left-[35px] w-[3px] bg-[#10b981] rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
      
      <div className="flex flex-col gap-12 relative z-10 py-4">
        {data.map((event: any, index: number) => (
          <div key={event.id || index} className="group relative flex items-center ml-2 h-6">
            {/* Polished Liquid Glass Dot */}
            <div className="relative w-6 h-6 rounded-full bg-[#10b981]/80 backdrop-blur-sm border border-white/80 shadow-[0_4px_6px_rgba(0,0,0,0.1),_0_0_12px_rgba(16,185,129,0.5)] transition-transform duration-300 group-hover:scale-150 z-20 flex-shrink-0 flex items-center justify-center cursor-pointer">
              {/* High-opacity white inner ring */}
              <div className="absolute w-3.5 h-3.5 rounded-full border-[2px] border-white/95"></div>
              {/* Core glow */}
              <div className="absolute w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_6px_#fff]"></div>
            </div>

            {/* Revealed Tooltip / Adjacent Card */}
            <div className="absolute left-10 w-64 liquid-panel bg-white/80 backdrop-blur-md border border-white/80 shadow-xl rounded-xl p-4 transition-all duration-300 opacity-0 invisible -translate-x-4 group-hover:opacity-100 group-hover:visible group-hover:translate-x-0 z-30 pointer-events-none">
              <div className="flex justify-between items-start mb-2">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider shadow-sm ${
                  event.severity === 'Critical' ? 'bg-red-100 text-red-600 border border-red-200' : 
                  event.severity === 'Warning' ? 'bg-amber-100 text-amber-600 border border-amber-200' : 
                  'bg-emerald-100 text-[#10b981] border border-emerald-200'
                }`}>
                  {event.severity}
                </span>
                <span className="text-[10px] text-gray-500 font-medium">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <h4 className="text-xs font-bold text-gray-800 mb-1">{event.eventType}</h4>
              <p className="text-[11px] text-gray-600 leading-relaxed line-clamp-2">{event.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
