import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  ErrorState,
  Input,
  ListSkeleton,
  NumberInput,
  PageHeader,
  Section,
  Select,
  Textarea,
  Toggle,
  toast,
} from '../../components/ui';
import type { ShopSettings } from '../../lib/api/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useSettings, useUpdateSettings } from './api';
import { settingsSchema, TIMEZONES, type SettingsForm } from './schema';

function toForm(s: ShopSettings): SettingsForm {
  return {
    shop_name: s.shop_name,
    timezone: (TIMEZONES as readonly string[]).includes(s.timezone) ? (s.timezone as SettingsForm['timezone']) : 'Africa/Addis_Ababa',
    receipt_footer: s.receipt_footer,
    default_reorder_level: s.default_reorder_level ?? 5,
    slow_mover_days: s.slow_mover_days ?? 30,
    allow_negative_stock: s.allow_negative_stock,
    staff_can_restock: s.staff_can_restock,
    staff_can_sell_below_cost: s.staff_can_sell_below_cost,
    low_stock_alerts: s.low_stock_alerts ?? false,
    daily_summary_enabled: s.daily_summary_enabled ?? false,
    daily_summary_time: s.daily_summary_time ?? '21:00',
  };
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const settings = useSettings();

  return (
    <div className="space-y-5">
      <PageHeader title={t('settings.title')} />
      {settings.isPending ? (
        <ListSkeleton rows={4} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      ) : (
        <SettingsFormView initial={toForm(settings.data)} />
      )}
    </div>
  );
}

function SettingsFormView({ initial }: { initial: SettingsForm }) {
  const { t } = useTranslation();
  const update = useUpdateSettings();
  const errorMessage = useErrorMessage();
  const form = useForm<SettingsForm>({ resolver: zodResolver(settingsSchema), defaultValues: initial });
  const { register, control, handleSubmit, formState, reset } = form;
  const [shopName, receiptFooter, summaryOn] = useWatch({ control, name: ['shop_name', 'receipt_footer', 'daily_summary_enabled'] });
  const err = (name: keyof SettingsForm) => {
    const m = formState.errors[name]?.message;
    return m ? t(m) : undefined;
  };

  useEffect(() => reset(initial), [initial, reset]);

  const onSubmit = handleSubmit((values) =>
    update.mutate(values, {
      onSuccess: () => toast.success(t('settings.saved')),
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="space-y-5" noValidate>
      <Section title={t('settings.shop')}>
        <Card className="space-y-4">
          <Input label={t('settings.shopName')} maxLength={80} error={err('shop_name')} {...register('shop_name')} value={shopName} />
          <Select
            label={t('settings.timezone')}
            options={TIMEZONES.map((z) => ({ value: z, label: z.replace('_', ' ') }))}
            error={err('timezone')}
            {...register('timezone')}
          />
          <Textarea
            label={t('settings.receiptFooter')}
            hint={t('settings.receiptFooterHint')}
            rows={2}
            maxLength={200}
            error={err('receipt_footer')}
            {...register('receipt_footer')}
            value={receiptFooter}
          />
        </Card>
      </Section>

      <Section title={t('settings.stock')}>
        <Card className="space-y-4">
          <Controller
            control={control}
            name="default_reorder_level"
            render={({ field }) => (
              <NumberInput
                label={t('settings.defaultReorder')}
                hint={t('settings.defaultReorderHint')}
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
                onBlur={field.onBlur}
                error={err('default_reorder_level')}
                max={100_000}
              />
            )}
          />
          <Controller
            control={control}
            name="slow_mover_days"
            render={({ field }) => (
              <NumberInput
                label={t('settings.slowMoverDays')}
                hint={t('settings.slowMoverDaysHint')}
                value={field.value}
                onChange={(v) => field.onChange(v ?? 0)}
                onBlur={field.onBlur}
                error={err('slow_mover_days')}
                max={365}
              />
            )}
          />
          <Controller
            control={control}
            name="allow_negative_stock"
            render={({ field }) => (
              <Toggle label={t('settings.allowNegative')} description={t('settings.allowNegativeHint')} checked={field.value} onChange={field.onChange} />
            )}
          />
        </Card>
      </Section>

      <Section title={t('settings.staff')}>
        <Card className="space-y-2">
          <Controller
            control={control}
            name="staff_can_restock"
            render={({ field }) => (
              <Toggle label={t('settings.staffRestock')} description={t('settings.staffRestockHint')} checked={field.value} onChange={field.onChange} />
            )}
          />
          <Controller
            control={control}
            name="staff_can_sell_below_cost"
            render={({ field }) => (
              <Toggle label={t('settings.staffBelowCost')} description={t('settings.staffBelowCostHint')} checked={field.value} onChange={field.onChange} />
            )}
          />
        </Card>
      </Section>

      <Section title={t('settings.bot')}>
        <Card className="space-y-2">
          <Controller
            control={control}
            name="low_stock_alerts"
            render={({ field }) => <Toggle label={t('settings.lowStockAlerts')} checked={field.value} onChange={field.onChange} />}
          />
          <Controller
            control={control}
            name="daily_summary_enabled"
            render={({ field }) => <Toggle label={t('settings.dailySummary')} checked={field.value} onChange={field.onChange} />}
          />
          {summaryOn ? (
            <Input type="time" label={t('settings.dailySummaryTime')} error={err('daily_summary_time')} {...register('daily_summary_time')} />
          ) : null}
          <p className="text-xs text-hint">{t('settings.botNote')}</p>
        </Card>
      </Section>

      <Button type="submit" block size="lg" icon={Save} loading={update.isPending} disabled={!formState.isDirty}>
        {t('settings.save')}
      </Button>
    </form>
  );
}
