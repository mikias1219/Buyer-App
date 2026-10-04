import { useMemo, useState } from 'react';
import { ProductCard } from '../components/ProductCard';
import { PageHeader, SectionCard, fieldClass } from '../components/ui';
import { useProducts } from '../context/ProductsContext';
import type { ProductCategory, ProductCondition } from '../types/product';

const CATEGORIES: Array<'All' | ProductCategory> = [
  'All',
  'Laptop',
  'Phone',
  'Tablet',
  'Accessory',
  'Other',
];

const CONDITIONS: Array<'All' | ProductCondition> = [
  'All',
  'New',
  'Like New',
  'Good',
  'Fair',
];

export function Home() {
  const { products, loading, usingMockData } = useProducts();
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('All');
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>('All');
  const [search, setSearch] = useState('');
  const [brand, setBrand] = useState('');
  const [city, setCity] = useState('');
  const [minPrice, setMinPrice] = useState('');
  const [maxPrice, setMaxPrice] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const brandQ = brand.trim().toLowerCase();
    const cityQ = city.trim().toLowerCase();
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;

    return products.filter((p) => {
      if (category !== 'All' && p.category !== category) return false;
      if (condition !== 'All' && p.condition !== condition) return false;
      if (brandQ && !p.brand.toLowerCase().includes(brandQ)) return false;
      if (cityQ && !p.city.toLowerCase().includes(cityQ)) return false;
      if (min !== null && !Number.isNaN(min) && p.price < min) return false;
      if (max !== null && !Number.isNaN(max) && p.price > max) return false;
      if (
        q &&
        !`${p.title} ${p.description} ${p.brand} ${p.city}`.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [products, category, condition, search, brand, city, minPrice, maxPrice]);

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="TechMarket ET"
        subtitle="Buy & sell used tech across Ethiopia · ETB"
      />

      {usingMockData && (
        <SectionCard className="!py-2.5 !px-3.5">
          <p className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
            Demo listings shown. Connect Supabase + run ALL_IN_ONE.sql for live data.
          </p>
        </SectionCard>
      )}

      <SectionCard className="!p-2">
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <span
              aria-hidden
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] text-[var(--tg-theme-hint-color,#8e8e93)]"
            >
              ⌕
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search phones, laptops…"
              className={`${fieldClass} !rounded-xl !py-2.5 pl-9`}
            />
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={[
              'shrink-0 rounded-xl px-3.5 text-[13px] font-semibold',
              showFilters
                ? 'bg-[var(--tg-theme-button-color,#2481cc)] text-white'
                : 'bg-[var(--tg-theme-bg-color,#efeff4)]',
            ].join(' ')}
          >
            Filters
          </button>
        </div>
      </SectionCard>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
        {CATEGORIES.map((name) => {
          const active = category === name;
          return (
            <button
              key={name}
              type="button"
              onClick={() => setCategory(name)}
              className={[
                'shrink-0 rounded-full px-3.5 py-2 text-[12px] font-semibold transition',
                active
                  ? 'bg-[var(--tg-theme-button-color,#2481cc)] text-[var(--tg-theme-button-text-color,#fff)] shadow-sm'
                  : 'bg-[var(--tg-theme-secondary-bg-color,#fff)] text-[var(--tg-theme-text-color,#000)] ring-1 ring-black/[0.04]',
              ].join(' ')}
            >
              {name}
            </button>
          );
        })}
      </div>

      {showFilters && (
        <SectionCard>
          <div className="grid grid-cols-2 gap-2.5">
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                Condition
              </span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value as typeof condition)}
                className={`${fieldClass} !py-2.5 !rounded-xl`}
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                Brand
              </span>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="Apple"
                className={`${fieldClass} !py-2.5 !rounded-xl`}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                City
              </span>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Addis Ababa"
                className={`${fieldClass} !py-2.5 !rounded-xl`}
              />
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                  Min ETB
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="0"
                  className={`${fieldClass} !py-2.5 !rounded-xl`}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                  Max ETB
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="∞"
                  className={`${fieldClass} !py-2.5 !rounded-xl`}
                />
              </label>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setCondition('All');
              setBrand('');
              setCity('');
              setMinPrice('');
              setMaxPrice('');
            }}
            className="mt-3 text-[13px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
          >
            Reset filters
          </button>
        </SectionCard>
      )}

      <div className="flex items-center justify-between px-0.5">
        <p className="text-[13px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
          {visible.length} listing{visible.length === 1 ? '' : 's'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] animate-pulse rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#fff)]"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <SectionCard className="py-12 text-center">
          <p className="text-[16px] font-semibold">No matches</p>
          <p className="mt-1 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
            Try clearing filters or search.
          </p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
