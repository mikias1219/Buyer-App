import { formatEtb } from '../../lib/format';
import { cn } from './cn';

/**
 * Money amount (`ETB 25,000`). `signed` adds +/−; `tone="auto"` colours by sign (profit/loss) —
 * never colour alone, the sign is always shown with it.
 */
export function Money({
  value,
  signed,
  tone,
  currency,
  className,
}: {
  value: number | null | undefined;
  signed?: boolean;
  tone?: 'auto' | 'muted';
  currency?: string;
  className?: string;
}) {
  const n = value ?? null;
  const toneClass =
    tone === 'auto' && n !== null ? (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : undefined) : tone === 'muted' ? 'text-hint' : undefined;
  return (
    <span className={cn('tabular whitespace-nowrap', toneClass, className)}>
      {formatEtb(n, { signed: Boolean(signed || tone === 'auto'), ...(currency ? { currency } : {}) })}
    </span>
  );
}
