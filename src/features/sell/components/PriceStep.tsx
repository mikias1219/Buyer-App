import { AlertTriangle, TrendingUp } from 'lucide-react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Card, Notice, NumberInput, Toggle } from '../../../components/ui';
import { formatEtb } from '../../../lib/format';
import { priceFlag } from '../../listings/logic';
import { usePriceHint } from '../api';
import type { ListingFormValues } from '../schema';

export function PriceStep({ control }: { control: Control<ListingFormValues> }) {
  const { t } = useTranslation();
  const [category, brand, price] = useWatch({ control, name: ['category', 'brand', 'price'] });
  const hint = usePriceHint(category, brand);
  const median = hint.data?.median ?? null;
  const flag = priceFlag(price, median);

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">{t('sell.price.title')}</h2>
        <p className="text-sm text-hint">{t('sell.price.subtitle')}</p>
      </div>
      <Controller
        control={control}
        name="price"
        render={({ field, fieldState }) => (
          <NumberInput
            label={t('fields.price')}
            prefix="ETB"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            placeholder="25,000"
            error={fieldState.error?.message ? t(fieldState.error.message) : undefined}
            autoFocus
          />
        )}
      />
      {median !== null ? (
        <Card className="flex items-center gap-3 bg-surface-2 shadow-none">
          <TrendingUp aria-hidden className="size-5 shrink-0 text-brand" />
          <p className="text-sm">{t('sell.price.marketHint', { price: formatEtb(median) })}</p>
        </Card>
      ) : null}
      {flag ? (
        <Notice tone="warning" icon={AlertTriangle} title={t(`sell.price.${flag}`)}>
          {t('sell.price.flagBody')}
        </Notice>
      ) : null}
      <Card className="divide-y divide-line py-1">
        <Controller
          control={control}
          name="negotiable"
          render={({ field }) => <Toggle label={t('listing.negotiable')} description={t('sell.price.negotiableHint')} checked={field.value} onChange={field.onChange} />}
        />
        <Controller
          control={control}
          name="exchange"
          render={({ field }) => <Toggle label={t('listing.exchange')} description={t('sell.price.exchangeHint')} checked={field.value} onChange={field.onChange} />}
        />
      </Card>
    </div>
  );
}
