import { cn } from './cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
  attention?: boolean;
}

/** Horizontally scrollable tabs with optional counts (Mine tabs, admin queues). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (v: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn('no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4', className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={it.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.value)}
            className={cn(
              'press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold',
              active ? 'bg-ink text-surface' : 'bg-surface text-hint shadow-card',
            )}
          >
            {it.label}
            {it.count !== undefined && it.count > 0 ? (
              <span
                className={cn(
                  'tabular rounded-full px-1.5 text-xs',
                  it.attention ? 'bg-danger text-white' : active ? 'bg-surface/20 text-surface' : 'bg-surface-2 text-ink',
                )}
              >
                {it.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
