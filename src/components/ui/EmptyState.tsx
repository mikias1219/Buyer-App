import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
        <Icon aria-hidden className="size-8" />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {description ? <p className="mt-1 max-w-xs text-sm text-hint">{description}</p> : null}
      {action ? <div className="mt-5 w-full max-w-xs">{action}</div> : null}
    </div>
  );
}
