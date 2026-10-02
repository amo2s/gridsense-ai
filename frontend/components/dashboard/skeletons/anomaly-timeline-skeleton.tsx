export default function AnomalyTimelineSkeleton() {
  return (
    <div className="liquid-panel p-6 animate-pulse">
      <div className="h-6 w-48 bg-gray-200/60 rounded-md mb-6"></div>
      
      <div className="relative border-l border-gray-200/60 ml-3 space-y-6">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="pl-6 relative">
            {/* Timeline dot */}
            <div className="absolute w-3 h-3 bg-gray-200/60 rounded-full -left-[6.5px] top-1.5 border border-white"></div>
            
            {/* Content */}
            <div className="flex justify-between items-start mb-1">
              <div className="h-5 w-1/3 bg-gray-200/60 rounded-md"></div>
              <div className="h-4 w-20 bg-gray-200/60 rounded-md"></div>
            </div>
            
            <div className="h-4 w-1/4 bg-gray-200/60 rounded-md mb-2"></div>
            <div className="h-4 w-full bg-gray-200/60 rounded-md mb-1"></div>
            <div className="h-4 w-5/6 bg-gray-200/60 rounded-md"></div>
          </div>
        ))}
      </div>
    </div>
  );
}
