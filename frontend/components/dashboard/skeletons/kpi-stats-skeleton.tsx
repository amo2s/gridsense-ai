export default function KpiStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="liquid-panel p-6 animate-pulse">
          <div className="flex justify-between items-center mb-4">
            <div className="h-4 w-32 bg-gray-200/60 rounded-md"></div>
            <div className="h-8 w-8 bg-gray-200/60 rounded-full"></div>
          </div>
          <div className="h-10 w-24 bg-gray-200/60 rounded-md mb-2"></div>
          <div className="h-3 w-48 bg-gray-200/60 rounded-md"></div>
        </div>
      ))}
    </div>
  );
}
