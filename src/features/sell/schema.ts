import { z } from 'zod';
import { CATEGORIES, CONDITIONS, type DraftListing, type ListingInput } from '../../lib/api/types';

/**
 * Sell/edit form. Messages are i18n keys (rendered with t()). Mirrors the database checks in
 * listing_missing_fields / products constraints, so most problems are caught before the RPC.
 */
export const listingFormSchema = z.object({
  category: z.enum(CATEGORIES, { error: 'validation.categoryRequired' }).nullable().refine((v) => v !== null, 'validation.categoryRequired'),
  condition: z.enum(CONDITIONS, { error: 'validation.conditionRequired' }).nullable().refine((v) => v !== null, 'validation.conditionRequired'),
  brand: z.string().trim().max(40, 'validation.tooLong'),
  model: z.string().trim().max(60, 'validation.tooLong'),
  title: z.string().trim().min(3, 'validation.titleMin').max(80, 'validation.tooLong'),
  description: z.string().trim().min(10, 'validation.descriptionMin').max(2000, 'validation.tooLong'),
  city: z.string().trim().min(1, 'validation.cityRequired').max(40, 'validation.tooLong'),
  specs: z.record(z.string(), z.union([z.string().max(60), z.number(), z.boolean()])),
  price: z
    .number()
    .nullable()
    .refine((v) => v !== null && v > 0, 'validation.priceRequired')
    .refine((v) => v === null || v < 100_000_000, 'validation.priceTooHigh'),
  negotiable: z.boolean(),
  exchange: z.boolean(),
});

export type ListingFormValues = z.input<typeof listingFormSchema>;

export const STEPS = ['photos', 'details', 'price', 'review'] as const;
export type Step = (typeof STEPS)[number];

export const STEP_FIELDS: Record<Exclude<Step, 'photos' | 'review'>, Array<keyof ListingFormValues>> = {
  details: ['category', 'condition', 'brand', 'model', 'title', 'description', 'city', 'specs'],
  price: ['price', 'negotiable', 'exchange'],
};

export const MIN_PHOTOS = 1;
export const MAX_PHOTOS = 8;

export function draftToForm(d: DraftListing): ListingFormValues {
  return {
    category: d.category,
    condition: d.condition,
    brand: d.brand,
    model: d.model,
    title: d.title,
    description: d.description,
    city: d.city,
    specs: d.specs ?? {},
    price: d.price,
    negotiable: d.negotiable,
    exchange: d.exchange,
  };
}

/** Only send fields that changed (keeps live-listing edits from triggering review needlessly). */
export function diffInput(before: ListingFormValues, after: ListingFormValues): ListingInput {
  const out: ListingInput = {};
  const keys = Object.keys(after) as Array<keyof ListingFormValues>;
  for (const k of keys) {
    const a = after[k];
    const b = before[k];
    const changed = k === 'specs' ? JSON.stringify(a) !== JSON.stringify(b) : a !== b;
    if (!changed) continue;
    const value = typeof a === 'string' ? a.trim() : a;
    (out as Record<string, unknown>)[k] = value;
  }
  return out;
}

/** Suggested title from structured fields (user can edit). */
export function suggestTitle(v: Pick<ListingFormValues, 'brand' | 'model' | 'specs'>): string {
  const storage = typeof v.specs.storage === 'string' ? v.specs.storage : '';
  return [v.brand.trim(), v.model.trim(), storage].filter(Boolean).join(' ').slice(0, 80);
}
