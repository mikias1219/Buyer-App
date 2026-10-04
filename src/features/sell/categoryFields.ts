import type { Category } from '../../lib/api/types';

/**
 * Category-specific spec fields (SPEC A5 flow 3), stored in products.specs.
 * Keys must match ^[a-z][a-z0-9_]{0,31}$ (enforced again in SQL by sanitize_specs).
 * Labels/options are i18n keys under `specs.<key>`.
 */
export type SpecField =
  | { key: string; type: 'select'; options: readonly string[]; filterable?: boolean }
  | { key: string; type: 'number'; min: number; max: number; unit?: string }
  | { key: string; type: 'text'; maxLength: number }
  | { key: string; type: 'toggle' };

const STORAGE = ['16GB', '32GB', '64GB', '128GB', '256GB', '512GB', '1TB', '2TB'] as const;
const RAM = ['2GB', '3GB', '4GB', '6GB', '8GB', '12GB', '16GB', '32GB', '64GB'] as const;

export const CATEGORY_FIELDS: Record<Category, readonly SpecField[]> = {
  phone: [
    { key: 'storage', type: 'select', options: STORAGE, filterable: true },
    { key: 'ram', type: 'select', options: RAM, filterable: true },
    { key: 'battery_health', type: 'number', min: 1, max: 100, unit: '%' },
    { key: 'imei_checked', type: 'toggle' },
    { key: 'warranty', type: 'toggle' },
  ],
  laptop: [
    { key: 'cpu', type: 'text', maxLength: 40 },
    { key: 'ram', type: 'select', options: RAM, filterable: true },
    { key: 'storage', type: 'select', options: STORAGE, filterable: true },
    { key: 'screen', type: 'select', options: ['11"', '13"', '14"', '15"', '16"', '17"'] },
    { key: 'battery_cycles', type: 'number', min: 0, max: 5000 },
  ],
  tablet: [
    { key: 'storage', type: 'select', options: STORAGE, filterable: true },
    { key: 'cellular', type: 'toggle' },
    { key: 'battery_health', type: 'number', min: 1, max: 100, unit: '%' },
  ],
  desktop: [
    { key: 'cpu', type: 'text', maxLength: 40 },
    { key: 'ram', type: 'select', options: RAM, filterable: true },
    { key: 'storage', type: 'select', options: STORAGE, filterable: true },
    { key: 'gpu', type: 'text', maxLength: 40 },
    { key: 'monitor_included', type: 'toggle' },
  ],
  watch: [
    { key: 'size', type: 'text', maxLength: 20 },
    { key: 'cellular', type: 'toggle' },
  ],
  audio: [{ key: 'wireless', type: 'toggle' }],
  accessory: [],
  other: [],
};

export function filterableFields(category: Category | undefined): Array<Extract<SpecField, { type: 'select' }>> {
  if (!category) return [];
  return CATEGORY_FIELDS[category].filter(
    (f): f is Extract<SpecField, { type: 'select' }> => f.type === 'select' && Boolean(f.filterable),
  );
}
