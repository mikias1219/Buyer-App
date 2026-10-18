import { CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDate } from '../../lib/format';
import { isIsoDate, PERIOD_PRESETS, resolvePeriod, type Period } from '../../lib/period';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';
import { Chip } from './Chip';
import { Input } from './Field';

/** Period presets as chips + a custom range sheet. Shows the resolved dates underneath. */
export function PeriodPicker({
  value,
  onChange,
  timeZone,
  presets = PERIOD_PRESETS,
}: {
  value: Period;
  onChange: (p: Period) => void;
  timeZone: string;
  presets?: readonly Period['preset'][];
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const range = resolvePeriod(value, timeZone);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const valid = isIsoDate(from) && isIsoDate(to);
  const label =
    range.from === range.to
      ? formatDate(range.from, i18n.language)
      : `${formatDate(range.from, i18n.language)} – ${formatDate(range.to, i18n.language)}`;

  return (
    <div className="space-y-1.5">
      <div role="radiogroup" aria-label={t('period.label')} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {presets
          .filter((p) => p !== 'custom')
          .map((p) => (
            <Chip key={p} role="radio" aria-checked={value.preset === p} selected={value.preset === p} onClick={() => onChange({ preset: p } as Period)}>
              {t(`period.${p}`)}
            </Chip>
          ))}
        <Chip
          icon={CalendarRange}
          role="radio"
          aria-checked={value.preset === 'custom'}
          selected={value.preset === 'custom'}
          onClick={() => {
            setFrom(range.from);
            setTo(range.to);
            setOpen(true);
          }}
        >
          {t('period.custom')}
        </Chip>
      </div>
      <p className="tabular px-0.5 text-xs text-hint">{label}</p>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('period.customTitle')}
        footer={
          <Button
            block
            disabled={!valid}
            onClick={() => {
              onChange({ preset: 'custom', from, to });
              setOpen(false);
            }}
          >
            {t('filters.apply')}
          </Button>
        }
      >
        <div className="grid grid-cols-2 gap-3 pt-1">
          <Input type="date" label={t('period.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" label={t('period.to')} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        </div>
      </BottomSheet>
    </div>
  );
}
