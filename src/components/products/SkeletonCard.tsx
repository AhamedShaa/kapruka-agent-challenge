export default function SkeletonCard(): React.JSX.Element {
  return (
    <div className="w-[200px] flex-shrink-0 rounded-xl border border-gray-200 animate-pulse overflow-hidden">
      <div className="h-[140px] bg-gray-200 rounded-t-xl" />
      <div className="p-3 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-full" />
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2 mt-1" />
      </div>
    </div>
  );
}
