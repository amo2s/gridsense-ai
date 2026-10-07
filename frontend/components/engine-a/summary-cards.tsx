import { Activity, AlertTriangle } from "lucide-react";

export function SummaryCards() {
  return (
    <>
      <MetricCard title="Overall Reliability" score={92} icon={<Activity className="w-5 h-5 text-[#10b981]" />} />
      <MetricCard title="High-Risk Areas" score={34} icon={<AlertTriangle className="w-5 h-5 text-red-500" />} />
    </>
  );
}

function MetricCard({ title, score, icon }: { title: string; score: number; icon: React.ReactNode }) {
  // Score color mapping: Deep Emerald Green (stable), High-contrast Amber (vulnerable), Deep Red (critical)
  let color = "#10b981"; // Deep Emerald Green
  if (score < 50) color = "#ef4444"; // Deep Red
  else if (score < 80) color = "#f59e0b"; // High-contrast Amber

  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="liquid-panel p-6 flex items-center justify-between relative overflow-hidden backdrop-blur-md bg-gradient-to-br from-white/80 to-white/30 border border-white/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),_0_8px_16px_-4px_rgba(0,0,0,0.1)]">
      {/* Specular edge highlight */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-80" />
      
      <div>
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <h3 className="text-lg font-semibold text-neutral-800">{title}</h3>
        </div>
        <p className="text-4xl font-bold text-neutral-900">{score}%</p>
      </div>

      <div className="relative flex items-center justify-center w-24 h-24">
        <svg className="transform -rotate-90 w-24 h-24">
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke="currentColor"
            strokeWidth="8"
            fill="transparent"
            className="text-neutral-200/50"
          />
          <circle
            cx="48"
            cy="48"
            r={radius}
            stroke={color}
            strokeWidth="8"
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-1000 ease-out"
            style={{ filter: `drop-shadow(0 0 4px ${color}80)` }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold" style={{ color }}>
            {score}
          </span>
        </div>
      </div>
    </div>
  );
}
