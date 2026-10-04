import { Wand2 } from 'lucide-react';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Button, Chip, Input, Select, Textarea, Toggle, cn } from '../../../components/ui';
import { CATEGORIES, CONDITIONS, type Category } from '../../../lib/api/types';
import { CATEGORY_ICONS } from '../../listings/categories';
import { CITIES } from '../../listings/schema';
import { CATEGORY_FIELDS, type SpecField } from '../categoryFields';
import { suggestTitle, type ListingFormValues } from '../schema';

const BRANDS: Partial<Record<Category, string[]>> = {
  phone: ['Apple', 'Samsung', 'Tecno', 'Infinix', 'Xiaomi', 'Itel', 'Huawei', 'Oppo', 'Google', 'Nokia'],
  laptop: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus', 'Acer', 'Toshiba', 'Microsoft'],
  tablet: ['Apple', 'Samsung', 'Lenovo', 'Huawei', 'Amazon'],
  desktop: ['HP', 'Dell', 'Lenovo', 'Apple', 'Asus'],
  watch: ['Apple', 'Samsung', 'Huawei', 'Xiaomi', 'Garmin'],
  audio: ['Sony', 'JBL', 'Apple', 'Samsung', 'Bose', 'Anker'],
  accessory: ['Anker', 'Apple', 'Samsung', 'Oraimo', 'Baseus'],
};

export function DetailsStep({ control, setValue }: { control: Control<ListingFormValues>; setValue: UseFormSetValue<ListingFormValues> }) {
  const { t } = useTranslation();
  const tr = (key: string | undefined) => (key ? t(key) : undefined);
  const [category, brand, model, specs, title] = useWatch({ control, name: ['category', 'brand', 'model', 'specs', 'title'] });
  const fields = category ? CATEGORY_FIELDS[category] : [];
  const suggestion = suggestTitle({ brand, model, specs });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">{t('sell.details.title')}</h2>
        <p className="text-sm text-hint">{t('sell.details.subtitle')}</p>
      </div>

      <Controller
        control={control}
        name="category"
        render={({ field, fieldState }) => (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('fields.category')}</legend>
            <div className="grid grid-cols-4 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = CATEGORY_ICONS[c];
                const on = field.value === c;
                return (
                  <button
                    key={c}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      if (field.value !== c) setValue('specs', {}, { shouldDirty: true });
                      field.onChange(c);
                    }}
                    className={cn(
                      'press flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-input border text-xs font-semibold',
                      on ? 'border-brand bg-brand-soft text-brand' : 'border-line bg-surface',
                    )}
                  >
                    <Icon aria-hidden className="size-6" />
                    {t(`category.${c}`)}
                  </button>
                );
              })}
            </div>
            {fieldState.error ? <p className="mt-1.5 text-xs font-medium text-danger">{tr(fieldState.error.message)}</p> : null}
          </fieldset>
        )}
      />

      <div className="grid grid-cols-2 gap-3">
        <Controller
          control={control}
          name="brand"
          render={({ field, fieldState }) => (
            <>
              <Input label={t('fields.brand')} list="brand-options" maxLength={40} error={tr(fieldState.error?.message)} {...field} />
              <datalist id="brand-options">
                {(category ? (BRANDS[category] ?? []) : []).map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </>
          )}
        />
        <Controller
          control={control}
          name="model"
          render={({ field, fieldState }) => (
            <Input label={t('fields.model')} placeholder={t('sell.details.modelPlaceholder')} maxLength={60} error={tr(fieldState.error?.message)} {...field} />
          )}
        />
      </div>

      <Controller
        control={control}
        name="condition"
        render={({ field, fieldState }) => (
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">{t('fields.condition')}</legend>
            <div className="flex flex-wrap gap-2">
              {CONDITIONS.map((c) => (
                <Chip key={c} selected={field.value === c} onClick={() => field.onChange(c)}>
                  {t(`condition.${c}`)}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-hint">{field.value ? t(`conditionHelp.${field.value}`) : t('sell.details.conditionHint')}</p>
            {fieldState.error ? <p className="mt-1 text-xs font-medium text-danger">{tr(fieldState.error.message)}</p> : null}
          </fieldset>
        )}
      />

      {fields.length ? (
        <fieldset className="space-y-3 rounded-card bg-surface p-4 shadow-card">
          <legend className="sr-only">{t('sell.details.specs')}</legend>
          <p className="text-sm font-semibold">{t('sell.details.specs')}</p>
          <Controller
            control={control}
            name="specs"
            render={({ field }) => (
              <div className="space-y-3">
                {fields.map((f) => (
                  <SpecInput key={f.key} field={f} value={field.value[f.key]} onChange={(v) => {
                    const next = { ...field.value };
                    if (v === undefined || v === '') delete next[f.key];
                    else next[f.key] = v;
                    field.onChange(next);
                  }} />
                ))}
              </div>
            )}
          />
        </fieldset>
      ) : null}

      <Controller
        control={control}
        name="title"
        render={({ field, fieldState }) => (
          <div className="space-y-1.5">
            <Input label={t('fields.title')} placeholder={t('sell.details.titlePlaceholder')} maxLength={80} error={tr(fieldState.error?.message)} {...field} />
            {suggestion && suggestion !== title ? (
              <Button size="sm" variant="ghost" icon={Wand2} onClick={() => setValue('title', suggestion, { shouldDirty: true, shouldValidate: true })}>
                {t('sell.details.useTitle', { title: suggestion })}
              </Button>
            ) : null}
          </div>
        )}
      />

      <Controller
        control={control}
        name="description"
        render={({ field, fieldState }) => (
          <Textarea
            label={t('fields.description')}
            placeholder={t('sell.details.descriptionPlaceholder')}
            maxLength={2000}
            rows={5}
            hint={t('sell.details.descriptionHint')}
            error={tr(fieldState.error?.message)}
            {...field}
          />
        )}
      />

      <Controller
        control={control}
        name="city"
        render={({ field, fieldState }) => (
          <Select
            label={t('fields.city')}
            placeholder={t('sell.details.cityPlaceholder')}
            options={CITIES.map((c) => ({ value: c, label: c }))}
            error={tr(fieldState.error?.message)}
            {...field}
          />
        )}
      />
    </div>
  );
}

function SpecInput({ field, value, onChange }: { field: SpecField; value: string | number | boolean | undefined; onChange: (v: string | number | boolean | undefined) => void }) {
  const { t } = useTranslation();
  const label = t(`specs.${field.key}`);
  switch (field.type) {
    case 'select':
      return (
        <Select
          label={label}
          optionalLabel={t('common.optional')}
          placeholder={t('search.any')}
          value={typeof value === 'string' ? value : ''}
          options={field.options.map((o) => ({ value: o, label: o }))}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case 'number':
      return (
        <Input
          label={field.unit ? `${label} (${field.unit})` : label}
          optionalLabel={t('common.optional')}
          inputMode="numeric"
          value={value === undefined ? '' : String(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '');
            if (!digits) return onChange(undefined);
            onChange(Math.min(Math.max(Number(digits), field.min), field.max));
          }}
        />
      );
    case 'text':
      return (
        <Input
          label={label}
          optionalLabel={t('common.optional')}
          maxLength={field.maxLength}
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case 'toggle':
      return <Toggle label={label} checked={value === true} onChange={(v) => onChange(v || undefined)} />;
  }
}
