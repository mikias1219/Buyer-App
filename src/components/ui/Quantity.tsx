import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../lib/format';
import type { Unit } from '../../lib/api/types';
import { cn } from './cn';

/** Quantity with its unit: `4 pcs`, `48.25 kg`. */
export function Quantity({ value, unit, className }: { value: number; unit: Unit; className?: string }) {
  const { t } = useTranslation();
  return (
    <span className={cn('tabular whitespace-nowrap', className)}>
      {formatNumber(value)} {t(`unitShort.${unit}`, { count: value })}
    </span>
  );
}
