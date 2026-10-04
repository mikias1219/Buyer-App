import { Star } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

export function RatingDisplay({ rating, count, size = 'sm' }: { rating: number | null; count: number; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  if (!count || rating === null) return <span className="text-xs text-hint">{t('rating.none')}</span>;
  return (
    <span className={cn('inline-flex items-center gap-1 font-semibold', size === 'sm' ? 'text-xs' : 'text-sm')} aria-label={t('rating.aria', { rating, count })}>
      <Star aria-hidden className={cn('fill-accent text-accent', size === 'sm' ? 'size-3.5' : 'size-4')} />
      <span className="tabular">{rating.toFixed(1)}</span>
      <span className="font-normal text-hint">({count})</span>
    </span>
  );
}

export function RatingInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  return (
    <div role="radiogroup" aria-label={t('rating.your')} className="flex justify-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={t('rating.stars', { count: n })}
          onClick={() => onChange(n)}
          className="press inline-flex size-12 items-center justify-center"
        >
          <Star aria-hidden className={cn('size-9', n <= value ? 'fill-accent text-accent' : 'text-line')} />
        </button>
      ))}
    </div>
  );
}
