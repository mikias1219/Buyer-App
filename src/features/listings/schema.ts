import { z } from 'zod';
import { CATEGORIES, CONDITIONS, type Specs } from '../../lib/api/types';

export const CITIES = [
  'Addis Ababa',
  'Adama',
  'Hawassa',
  'Bahir Dar',
  'Mekelle',
  'Dire Dawa',
  'Gondar',
  'Jimma',
  'Dessie',
  'Harar',
  'Bishoftu',
  'Arba Minch',
  'Shashemene',
  'Debre Birhan',
  'Jijiga',
] as const;

const optionalPrice = z.number().int().nonnegative().max(99_999_999).optional();

export const searchFiltersSchema = z
  .object({
    q: z.string().trim().max(80).default(''),
    category: z.enum(CATEGORIES).optional(),
    conditions: z.array(z.enum(CONDITIONS)).default([]),
    city: z.string().trim().max(40).default(''),
    brand: z.string().trim().max(40).default(''),
    minPrice: optionalPrice,
    maxPrice: optionalPrice,
    specs: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,31}$/), z.union([z.string().max(60), z.number(), z.boolean()])).default({}),
    sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
    featured: z.boolean().default(false),
  })
  .refine((f) => f.minPrice === undefined || f.maxPrice === undefined || f.minPrice <= f.maxPrice, {
    path: ['maxPrice'],
    message: 'range',
  });

export type SearchFilters = z.infer<typeof searchFiltersSchema>;

export const EMPTY_FILTERS: SearchFilters = searchFiltersSchema.parse({});

const num = (v: string | null) => {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : undefined;
};

/** URL ⇄ filters (shareable search links; invalid params are dropped, never thrown). */
export function filtersFromParams(params: URLSearchParams): SearchFilters {
  const specs: Specs = {};
  params.forEach((value, key) => {
    if (key.startsWith('spec.')) specs[key.slice(5)] = value;
  });
  const raw = {
    q: params.get('q') ?? '',
    category: params.get('category') || undefined,
    conditions: (params.get('cond') ?? '').split(',').filter(Boolean),
    city: params.get('city') ?? '',
    brand: params.get('brand') ?? '',
    minPrice: num(params.get('min')),
    maxPrice: num(params.get('max')),
    specs,
    sort: params.get('sort') || undefined,
    featured: params.get('featured') === '1',
  };
  const parsed = searchFiltersSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Keep whatever is valid field by field.
  const safe: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    const single = searchFiltersSchema.safeParse({ [k]: v });
    if (single.success) safe[k] = v;
  }
  return searchFiltersSchema.safeParse(safe).data ?? EMPTY_FILTERS;
}

export function filtersToParams(f: SearchFilters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.category) p.set('category', f.category);
  if (f.conditions.length) p.set('cond', f.conditions.join(','));
  if (f.city) p.set('city', f.city);
  if (f.brand) p.set('brand', f.brand);
  if (f.minPrice !== undefined) p.set('min', String(f.minPrice));
  if (f.maxPrice !== undefined) p.set('max', String(f.maxPrice));
  for (const [k, v] of Object.entries(f.specs)) p.set(`spec.${k}`, String(v));
  if (f.sort !== 'newest') p.set('sort', f.sort);
  if (f.featured) p.set('featured', '1');
  return p;
}

/** Number of active filters (excluding text query and sort), for the filter button badge. */
export function activeFilterCount(f: SearchFilters): number {
  return (
    (f.category ? 1 : 0) +
    f.conditions.length +
    (f.city ? 1 : 0) +
    (f.brand ? 1 : 0) +
    (f.minPrice !== undefined || f.maxPrice !== undefined ? 1 : 0) +
    Object.keys(f.specs).length +
    (f.featured ? 1 : 0)
  );
}
