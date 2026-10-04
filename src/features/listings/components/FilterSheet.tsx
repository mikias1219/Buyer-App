import { RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Chip, Input, NumberInput, Select, Toggle } from '../../../components/ui';
import { CATEGORIES, CONDITIONS, type Category } from '../../../lib/api/types';
import { filterableFields } from '../../sell/categoryFields';
import { CATEGORY_ICONS } from '../categories';
import { CITIES, EMPTY_FILTERS, searchFiltersSchema, type SearchFilters } from '../schema';

export function FilterSheet({
  open,
  initial,
  onClose,
  onApply,
}: {
  open: boolean;
  initial: SearchFilters;
  onClose: () => void;
  onApply: (f: SearchFilters) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initial);
  const [rangeError, setRangeError] = useState<string | undefined>();
  const set = (patch: Partial<SearchFilters>) => setDraft((d) => ({ ...d, ...patch }));

  const apply = () => {
    const parsed = searchFiltersSchema.safeParse(draft);
    if (!parsed.success) {
      setRangeError(t('search.priceRangeError'));
      return;
    }
    onApply(parsed.data);
  };

  const specFields = filterableFields(draft.category);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('search.filters')}
      size="tall"
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" icon={RotateCcw} onClick={() => setDraft({ ...EMPTY_FILTERS, q: draft.q })}>
            {t('search.reset')}
          </Button>
          <Button block onClick={apply}>
            {t('search.showResults')}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pt-2">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('fields.category')}</legend>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                icon={CATEGORY_ICONS[c]}
                selected={draft.category === c}
                onClick={() => set({ category: draft.category === c ? undefined : (c as Category), specs: {} })}
              >
                {t(`category.${c}`)}
              </Chip>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-semibold">{t('fields.condition')}</legend>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => {
              const on = draft.conditions.includes(c);
              return (
                <Chip key={c} selected={on} onClick={() => set({ conditions: on ? draft.conditions.filter((x) => x !== c) : [...draft.conditions, c] })}>
                  {t(`condition.${c}`)}
                </Chip>
              );
            })}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <NumberInput label={t('search.minPrice')} prefix="ETB" value={draft.minPrice ?? null} onChange={(v) => set({ minPrice: v ?? undefined })} />
          <NumberInput
            label={t('search.maxPrice')}
            prefix="ETB"
            value={draft.maxPrice ?? null}
            onChange={(v) => {
              setRangeError(undefined);
              set({ maxPrice: v ?? undefined });
            }}
            error={rangeError}
          />
        </div>

        <Select
          label={t('fields.city')}
          value={draft.city}
          placeholder={t('search.anyCity')}
          options={CITIES.map((c) => ({ value: c, label: c }))}
          onChange={(e) => set({ city: e.target.value })}
        />
        <Input label={t('fields.brand')} value={draft.brand} placeholder={t('search.brandPlaceholder')} maxLength={40} onChange={(e) => set({ brand: e.target.value })} />

        {specFields.map((f) => (
          <Select
            key={f.key}
            label={t(`specs.${f.key}`)}
            value={String(draft.specs[f.key] ?? '')}
            placeholder={t('search.any')}
            options={f.options.map((o) => ({ value: o, label: o }))}
            onChange={(e) => {
              const specs = { ...draft.specs };
              if (e.target.value) specs[f.key] = e.target.value;
              else delete specs[f.key];
              set({ specs });
            }}
          />
        ))}

        <Toggle label={t('search.featuredOnly')} checked={draft.featured} onChange={(v) => set({ featured: v })} />
      </div>
    </BottomSheet>
  );
}
