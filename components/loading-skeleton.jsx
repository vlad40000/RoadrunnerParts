export default function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-1/4 rounded bg-slate-200" />
      <div className="space-y-3">
        <div className="h-4 rounded bg-slate-200" />
        <div className="h-4 w-5/6 rounded bg-slate-200" />
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="h-10 w-full bg-slate-100" />
        <div className="space-y-4 p-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex space-x-4">
              <div className="h-4 w-1/3 rounded bg-slate-200" />
              <div className="h-4 w-1/4 rounded bg-slate-200" />
              <div className="h-4 w-1/4 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
