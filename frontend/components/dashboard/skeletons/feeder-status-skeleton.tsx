export default function FeederStatusSkeleton() {
  return (
    <div className="liquid-panel p-6 w-full animate-pulse">
      <div className="flex justify-between items-center mb-6">
        <div className="h-6 w-40 bg-gray-200/60 rounded-md"></div>
        <div className="h-8 w-24 bg-gray-200/60 rounded-md"></div>
      </div>
      
      <div className="overflow-x-auto">
        <div className="min-w-full">
          {/* Header */}
          <div className="flex border-b border-gray-100 pb-3 mb-4">
            <div className="w-1/4 h-4 bg-gray-200/60 rounded-md"></div>
            <div className="w-1/4 h-4 bg-gray-200/60 rounded-md mx-2"></div>
            <div className="w-1/4 h-4 bg-gray-200/60 rounded-md mx-2"></div>
            <div className="w-1/4 h-4 bg-gray-200/60 rounded-md ml-2"></div>
          </div>
          
          {/* Rows */}
          <div className="flex flex-col gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center">
                <div className="w-1/4 h-5 bg-gray-200/60 rounded-md"></div>
                <div className="w-1/4 h-5 bg-gray-200/60 rounded-md mx-2"></div>
                <div className="w-1/4 h-5 bg-gray-200/60 rounded-md mx-2"></div>
                <div className="w-1/4 h-8 bg-gray-200/60 rounded-full ml-2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
