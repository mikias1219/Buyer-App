import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('animate-pulse rounded-input bg-surface-2', className)} />;
}

/** Placeholder for a ListGroup of ListRows. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-3 w-2/5" />
          </div>
          <Skeleton className="h-4 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Placeholder for a grid of StatCards. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-busy="true" className="grid grid-cols-2 gap-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-2 rounded-card bg-surface p-3.5 shadow-card">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      ))}
    </div>
  );
}

/** Generic page placeholder used while a lazy route loads. */
export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-7 w-1/2" />
      <ListSkeleton rows={5} />
    </div>
  );
}
