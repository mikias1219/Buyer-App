import type { LucideIcon } from 'lucide-react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

/**
 * KPI tile. `delta` is a percent change vs the previous period (null = no comparison).
 * `invert` marks metrics where going up is bad (expenses, stock loss).
 */
export function StatCard({
  label,
  value,
  delta,
  invert,
  hint,
  icon: Icon,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: number | null;
  invert?: boolean;
  hint?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const { t } = useTranslation();
  const good = delta === null || delta === undefined || delta === 0 ? null : (delta > 0) !== Boolean(invert);
  const DeltaIcon = !delta ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn('rounded-card bg-surface p-3.5 shadow-card', className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-hint">
        {Icon ? <Icon aria-hidden className="size-4" /> : null}
        {label}
      </p>
      <p className="tabular mt-1 text-lg font-bold leading-tight">{value}</p>
      {delta !== undefined ? (
        <p
          className={cn('mt-1 flex items-center gap-0.5 text-xs font-semibold', good === null ? 'text-hint' : good ? 'text-success' : 'text-danger')}
        >
          <DeltaIcon aria-hidden className="size-3.5" />
          {delta === null ? t('stats.noComparison') : t('stats.vsPrevious', { value: `${delta > 0 ? '+' : ''}${delta}%` })}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-hint">{hint}</p>
      ) : null}
    </div>
  );
}
