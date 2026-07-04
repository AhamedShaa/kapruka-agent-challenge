export default function SkeletonCard(): React.JSX.Element {
  return (
    <div className="w-[200px] flex-shrink-0 rounded-xl border border-gray-200 dark:border-[#3A3350] overflow-hidden animate-pulse">
      {/* Matches ProductCard 1:1 image — no layout jump when data arrives */}
      <div className="w-full aspect-square bg-gray-200 dark:bg-[#2A2438]" />
      <div className="p-3 flex flex-col gap-2">
        {/* Title — 2 lines */}
        <div className="h-3 bg-gray-200 dark:bg-[#2A2438] rounded-full w-full" />
        <div className="h-3 bg-gray-200 dark:bg-[#2A2438] rounded-full w-4/5" />
        {/* Price */}
        <div className="h-3 bg-gray-100 dark:bg-[#201C2C] rounded-full w-2/5" />
        {/* Details button */}
        <div className="h-7 bg-gray-100 dark:bg-[#201C2C] rounded-lg mt-0.5" />
      </div>
    </div>
  );
}
