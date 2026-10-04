import { ArrowDownUp, SearchX } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { Button, Chip, EmptyState, ErrorState, GridSkeleton, ListingCard, Select, Spinner } from '../../../components/ui';
import { formatEtb } from '../../../lib/format';
import { cloudStorage } from '../../../lib/telegram';
import { useSearch } from '../api';
import { FilterSheet } from '../components/FilterSheet';
import { SearchBar } from '../components/SearchBar';
import { activeFilterCount, EMPTY_FILTERS, filtersFromParams, filtersToParams, type SearchFilters } from '../schema';

const LAST_FILTERS_KEY = 'tm_last_search';

export default function SearchPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const [sheetOpen, setSheetOpen] = useState(params.get('filters') === '1');
  const [text, setText] = useState(filters.q);
  const search = useSearch(filters);

  const update = (next: SearchFilters) => {
    setParams(filtersToParams(next), { replace: true });
    void cloudStorage.set(LAST_FILTERS_KEY, filtersToParams(next).toString());
  };

  // Restore the last search when arriving with no parameters (spec Phase 4 §2).
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if ([...params.keys()].length === 0) {
      void cloudStorage.get(LAST_FILTERS_KEY).then((saved) => {
        if (saved) {
          const f = filtersFromParams(new URLSearchParams(saved));
          setText(f.q);
          setParams(filtersToParams(f), { replace: true });
        }
      });
    }
  }, [params, setParams]);

  // Debounce typing → URL.
  useEffect(() => {
    if (text.trim() === filters.q) return;
    const id = setTimeout(() => update({ ...filters, q: text.trim() }), 350);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [text]);

  // Infinite scroll sentinel.
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && search.hasNextPage && !search.isFetchingNextPage) void search.fetchNextPage();
    }, { rootMargin: '400px' });
    io.observe(el);
    return () => io.disconnect();
  }, [search]);

  const items = search.data?.pages.flatMap((p) => p.items) ?? [];
  const total = search.data?.pages[0]?.total ?? 0;
  const chips = activeChips(filters, t);

  return (
    <div className="space-y-4">
      <SearchBar value={text} onChange={setText} onFilters={() => setSheetOpen(true)} filterCount={activeFilterCount(filters)} autoFocus={!filters.category && !filters.q} />

      {chips.length ? (
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
          {chips.map((c) => (
            <Chip key={c.key} onRemove={() => update(c.remove())} removeLabel={t('search.removeFilter', { name: c.label })}>
              {c.label}
            </Chip>
          ))}
          <Chip onClick={() => update({ ...EMPTY_FILTERS, q: filters.q })}>{t('search.clearAll')}</Chip>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-hint" aria-live="polite">
          {search.isPending ? t('common.loading') : t('search.results', { count: total })}
        </p>
        <label className="flex items-center gap-1.5">
          <ArrowDownUp aria-hidden className="size-4 text-hint" />
          <span className="sr-only">{t('search.sort')}</span>
          <Select
            value={filters.sort}
            className="min-h-9 border-transparent bg-transparent py-0 pl-1 text-sm font-semibold"
            options={[
              { value: 'newest', label: t('search.sortNewest') },
              { value: 'price_asc', label: t('search.sortPriceAsc') },
              { value: 'price_desc', label: t('search.sortPriceDesc') },
            ]}
            onChange={(e) => update({ ...filters, sort: e.target.value as SearchFilters['sort'] })}
          />
        </label>
      </div>

      {search.isPending ? (
        <GridSkeleton />
      ) : search.isError ? (
        <ErrorState error={search.error} onRetry={() => void search.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={t('search.emptyTitle')}
          description={t('search.emptyBody')}
          action={
            activeFilterCount(filters) || filters.q ? (
              <Button variant="secondary" block onClick={() => { setText(''); update(EMPTY_FILTERS); }}>
                {t('search.clearAll')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <ul className="grid grid-cols-2 gap-3">
            {items.map((it) => (
              <li key={it.id}>
                <ListingCard item={it} className="h-full" />
              </li>
            ))}
          </ul>
          <div ref={sentinel} />
          {search.hasNextPage ? (
            <Button variant="secondary" block loading={search.isFetchingNextPage} onClick={() => void search.fetchNextPage()}>
              {t('search.loadMore')}
            </Button>
          ) : (
            <p className="py-2 text-center text-xs text-hint">{t('search.end')}</p>
          )}
        </>
      )}
      {search.isFetching && !search.isPending && !search.isFetchingNextPage ? (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-surface p-2 shadow-card">
          <Spinner className="size-4 text-brand" label={t('common.loading')} />
        </div>
      ) : null}

      {sheetOpen ? (
        <FilterSheet
          open
          initial={filters}
          onClose={() => setSheetOpen(false)}
          onApply={(f) => {
            setSheetOpen(false);
            update(f);
          }}
        />
      ) : null}
    </div>
  );
}

type T = (k: string, o?: Record<string, unknown>) => string;

function activeChips(f: SearchFilters, t: T): Array<{ key: string; label: string; remove: () => SearchFilters }> {
  const chips: Array<{ key: string; label: string; remove: () => SearchFilters }> = [];
  if (f.category) chips.push({ key: 'cat', label: t(`category.${f.category}`), remove: () => ({ ...f, category: undefined, specs: {} }) });
  for (const c of f.conditions) {
    chips.push({ key: `cond-${c}`, label: t(`condition.${c}`), remove: () => ({ ...f, conditions: f.conditions.filter((x) => x !== c) }) });
  }
  if (f.city) chips.push({ key: 'city', label: f.city, remove: () => ({ ...f, city: '' }) });
  if (f.brand) chips.push({ key: 'brand', label: f.brand, remove: () => ({ ...f, brand: '' }) });
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    const label =
      f.minPrice !== undefined && f.maxPrice !== undefined
        ? `${formatEtb(f.minPrice)} – ${formatEtb(f.maxPrice)}`
        : f.minPrice !== undefined
          ? `≥ ${formatEtb(f.minPrice)}`
          : `≤ ${formatEtb(f.maxPrice)}`;
    chips.push({ key: 'price', label, remove: () => ({ ...f, minPrice: undefined, maxPrice: undefined }) });
  }
  for (const [k, v] of Object.entries(f.specs)) {
    chips.push({
      key: `spec-${k}`,
      label: `${t(`specs.${k}`)}: ${String(v)}`,
      remove: () => {
        const specs = { ...f.specs };
        delete specs[k];
        return { ...f, specs };
      },
    });
  }
  if (f.featured) chips.push({ key: 'featured', label: t('listing.featured'), remove: () => ({ ...f, featured: false }) });
  return chips;
}
