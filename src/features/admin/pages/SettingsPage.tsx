import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { PrimaryAction } from '../../../app/telegramHooks';
import { Card, ErrorState, Input, NumberInput, Section, Skeleton, Textarea, Toggle, toast } from '../../../components/ui';
import type { AdminSettings } from '../../../lib/api/types';
import { formatRelative } from '../../../lib/format';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useAdminSettings, useUpdateSettings } from '../api';

const int = (min: number, max: number) => z.number({ error: 'validation.number' }).int().min(min, 'validation.range').max(max, 'validation.range');
const handle = z.string().trim().regex(/^@?[A-Za-z0-9_]{0,32}$/, 'validation.handle');

const schema = z.object({
  listing_fee_etb: int(0, 1_000_000),
  free_listings_quota: int(0, 100),
  listing_duration_days: int(1, 365),
  reminder_days_before: int(0, 30),
  max_active_listings: int(1, 1000),
  boost_price_etb: int(0, 1_000_000),
  boost_days: int(1, 90),
  contact_daily_limit: int(1, 1000),
  payment_sla_minutes: int(5, 10080),
  telebirr_number: z.string().trim().regex(/^(\+?[0-9]{9,15})?$/, 'validation.phone'),
  telebirr_name: z.string().trim().max(80, 'validation.tooLong'),
  support_username: handle,
  bot_username: handle,
  mini_app_short_name: z.string().trim().regex(/^[A-Za-z0-9_]{0,64}$/, 'validation.handle'),
  channel_id: z.string().trim().regex(/^(-?[0-9]{1,20}|@[A-Za-z0-9_]{4,32})?$/, 'validation.channel'),
  channel_autopost: z.boolean(),
  banned_words_text: z.string().max(5000),
});
type Values = z.infer<typeof schema>;

function toValues(s: AdminSettings): Values {
  const { banned_words, updated_at: _u, updated_by: _b, ...rest } = s;
  return { ...rest, listing_fee_etb: Math.round(s.listing_fee_etb), boost_price_etb: Math.round(s.boost_price_etb), banned_words_text: banned_words.join('\n') };
}

export default function SettingsPage() {
  const settings = useAdminSettings();
  if (settings.isPending) return <Skeleton className="h-96 w-full" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />;
  return <SettingsForm key={settings.data.updated_at} settings={settings.data} />;
}

function SettingsForm({ settings }: { settings: AdminSettings }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const update = useUpdateSettings();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: toValues(settings) });
  const err = (m?: string) => (m ? t(m) : undefined);

  const save = form.handleSubmit((v) => {
    const { banned_words_text, ...rest } = v;
    update.mutate(
      {
        ...rest,
        banned_words: banned_words_text.split(/[\n,]/).map((w) => w.trim()).filter(Boolean),
      },
      { onSuccess: () => toast.success(t('admin.saved')), onError: (e) => toast.error(errorMessage(e)) },
    );
  });

  const num = (name: keyof Values, label: string, hint?: string, prefix?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <NumberInput
          label={label}
          hint={hint}
          prefix={prefix}
          value={typeof field.value === 'number' ? field.value : null}
          onChange={(v) => field.onChange(v ?? 0)}
          onBlur={field.onBlur}
          error={err(fieldState.error?.message)}
        />
      )}
    />
  );
  const text = (name: keyof Values, label: string, hint?: string) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <Input label={label} hint={hint} value={String(field.value ?? '')} onChange={field.onChange} onBlur={field.onBlur} error={err(fieldState.error?.message)} />
      )}
    />
  );

  return (
    <form noValidate onSubmit={(e) => void save(e)} className="space-y-5">
      <div>
        <h1 className="text-lg font-bold">{t('admin.settings.title')}</h1>
        <p className="text-xs text-hint">{t('admin.settings.updated', { when: formatRelative(settings.updated_at, i18n.language) })}</p>
      </div>
      <Section title={t('admin.settings.pricing')}>
        <Card className="grid gap-3">
          {num('listing_fee_etb', t('admin.settings.fee'), t('admin.settings.feeHint'), 'ETB')}
          {num('free_listings_quota', t('admin.settings.quota'), t('admin.settings.quotaHint'))}
          <div className="grid grid-cols-2 gap-3">
            {num('boost_price_etb', t('admin.settings.boostPrice'), undefined, 'ETB')}
            {num('boost_days', t('admin.settings.boostDays'))}
          </div>
        </Card>
      </Section>
      <Section title={t('admin.settings.limits')}>
        <Card className="grid grid-cols-2 gap-3">
          {num('listing_duration_days', t('admin.settings.duration'))}
          {num('reminder_days_before', t('admin.settings.reminder'))}
          {num('max_active_listings', t('admin.settings.maxActive'))}
          {num('contact_daily_limit', t('admin.settings.contactLimit'))}
          {num('payment_sla_minutes', t('admin.settings.sla'))}
        </Card>
      </Section>
      <Section title={t('admin.settings.payments')}>
        <Card className="grid gap-3">
          {text('telebirr_number', t('pay.telebirrNumber'))}
          {text('telebirr_name', t('pay.accountName'))}
        </Card>
      </Section>
      <Section title={t('admin.settings.telegram')}>
        <Card className="grid gap-3">
          {text('bot_username', t('admin.settings.bot'), t('admin.settings.botHint'))}
          {text('mini_app_short_name', t('admin.settings.appName'), t('admin.settings.appNameHint'))}
          {text('support_username', t('admin.settings.support'))}
          {text('channel_id', t('admin.settings.channel'), t('admin.settings.channelHint'))}
          <Controller
            control={form.control}
            name="channel_autopost"
            render={({ field }) => <Toggle label={t('admin.settings.autopost')} description={t('admin.settings.autopostHint')} checked={field.value} onChange={field.onChange} />}
          />
        </Card>
      </Section>
      <Section title={t('admin.settings.moderation')}>
        <Card>
          <Controller
            control={form.control}
            name="banned_words_text"
            render={({ field }) => <Textarea label={t('admin.settings.bannedWords')} hint={t('admin.settings.bannedWordsHint')} rows={5} {...field} />}
          />
        </Card>
      </Section>
      <PrimaryAction text={t('admin.settings.save')} onClick={() => void save()} loading={update.isPending} disabled={!form.formState.isDirty} />
    </form>
  );
}
