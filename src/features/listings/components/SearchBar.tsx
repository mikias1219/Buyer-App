import { Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton, controlClass, cn } from '../../../components/ui';

export function SearchBar({
  value,
  onChange,
  onSubmit,
  onFilters,
  filterCount = 0,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  onFilters?: () => void;
  filterCount?: number;
  autoFocus?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <form
      role="search"
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t('search.label')}</span>
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-hint" />
        <input
          type="search"
          enterKeyHint="search"
          value={value}
          autoFocus={autoFocus}
          maxLength={80}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('search.placeholder')}
          className={cn(controlClass, 'border-transparent bg-surface pl-11 shadow-card')}
        />
      </label>
      {onFilters ? (
        <span className="relative">
          <IconButton icon={SlidersHorizontal} label={t('search.filters')} variant={filterCount ? 'active' : 'surface'} onClick={onFilters} />
          {filterCount ? (
            <span className="tabular pointer-events-none absolute -right-0.5 -top-0.5 flex size-5 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-contrast">
              {filterCount}
            </span>
          ) : null}
        </span>
      ) : null}
    </form>
  );
}
