import { Check } from 'lucide-react';
import { cn } from './cn';

export function Stepper({ steps, current, label }: { steps: readonly string[]; current: number; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex items-center gap-1.5">
        {steps.map((s, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={s} className="flex min-w-0 flex-1 flex-col gap-1.5" aria-current={active ? 'step' : undefined}>
              <span className={cn('h-1 rounded-full', done || active ? 'bg-brand' : 'bg-line')} />
              <span className={cn('flex items-center gap-1 truncate text-xs font-medium', active ? 'text-ink' : 'text-hint')}>
                {done ? <Check aria-hidden className="size-3.5 text-brand" /> : null}
                {s}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
