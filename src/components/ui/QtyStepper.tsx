import { Minus, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { formatNumber } from '../../lib/format';
import { IconButton } from './IconButton';

/** − qty + for whole-number units. */
export function QtyStepper({ value, onChange, max, label }: { value: number; onChange: (v: number) => void; max?: number; label: string }) {
  const { t } = useTranslation();
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-0.5" role="group" aria-label={label}>
      <IconButton icon={Minus} size="sm" label={t('qty.decrease')} onClick={() => onChange(value - 1)} />
      <span className="tabular min-w-8 text-center text-sm font-bold" aria-live="polite">
        {formatNumber(value)}
      </span>
      <IconButton icon={Plus} size="sm" label={t('qty.increase')} disabled={max !== undefined && value >= max} onClick={() => onChange(value + 1)} />
    </div>
  );
}
