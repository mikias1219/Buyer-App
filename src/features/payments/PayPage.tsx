import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, CheckCircle2, Clock, Copy, ImagePlus, Receipt, Smartphone, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { z } from 'zod';
import { PrimaryAction } from '../../app/telegramHooks';
import { Button, Card, EmptyState, ErrorState, Input, ListingRow, Notice, PageHeader, PaymentStatusBadge, Skeleton, Spinner, toast } from '../../components/ui';
import { toAppError } from '../../lib/api/errors';
import type { PaymentDetail } from '../../lib/api/types';
import { formatEtb } from '../../lib/format';
import { haptic, openExternalLink } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { isValidReference, normalizeReference } from '../listings/logic';
import { useSubmitListing, uploadPaymentProof } from '../sell/api';
import { usePayment, useSubmitPayment } from './api';
import { providerFor } from './provider';

const referenceSchema = z.object({
  reference: z
    .string()
    .trim()
    .refine((v) => isValidReference(v), 'validation.reference'),
});

export default function PayPage() {
  const { paymentId } = useParams<{ paymentId: string }>();
  const { t } = useTranslation();
  const payment = usePayment(paymentId);

  if (payment.isPending) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (payment.isError) {
    return toAppError(payment.error).code === 'not_found' ? (
      <EmptyState icon={Receipt} title={t('pay.notFound')} />
    ) : (
      <ErrorState error={payment.error} onRetry={() => void payment.refetch()} />
    );
  }
  return <PayView payment={payment.data} />;
}

function PayView({ payment }: { payment: PaymentDetail }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const submit = useSubmitPayment(payment);
  const resubmit = useSubmitListing();
  const instructions = providerFor(payment).instructions(payment);
  const [shot, setShot] = useState<{ path: string; name: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const form = useForm<z.infer<typeof referenceSchema>>({ resolver: zodResolver(referenceSchema), defaultValues: { reference: '' } });

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      haptic.notify('success');
      toast.success(t('pay.copied'));
    } catch {
      toast.info(value);
    }
  };

  const onSubmit = form.handleSubmit((v) =>
    submit.mutate(
      { reference: normalizeReference(v.reference), ...(shot ? { screenshotPath: shot.path } : {}) },
      { onSuccess: () => haptic.notify('success'), onError: (e) => toast.error(errorMessage(e)) },
    ),
  );

  const header = (
    <>
      <PageHeader title={t(`pay.title.${payment.kind}`)} subtitle={t(`pay.subtitle.${payment.kind}`)} action={<PaymentStatusBadge status={payment.status} />} />
      <ListingRow title={payment.product.title} price={payment.product.price} coverPath={payment.product.cover_path} />
    </>
  );

  if (payment.status === 'submitted') {
    return (
      <div className="space-y-4">
        {header}
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Clock aria-hidden className="size-8" />
          </span>
          <h2 className="text-lg font-bold">{t('pay.waitingTitle')}</h2>
          <p className="max-w-xs text-sm text-hint">{t('pay.waitingBody', { minutes: payment.sla_minutes ?? 60 })}</p>
          <p className="text-sm">
            {t('pay.reference')}: <span className="tabular font-mono font-semibold">{payment.reference}</span>
          </p>
          <span className="flex items-center gap-1.5 text-xs text-hint">
            <Spinner className="size-3.5" /> {t('pay.autoRefresh')}
          </span>
        </Card>
        <Button block variant="secondary" onClick={() => navigate('/mine', { replace: true })}>
          {t('pay.backToMine')}
        </Button>
      </div>
    );
  }

  if (payment.status === 'confirmed' || payment.status === 'refunded') {
    return (
      <div className="space-y-4">
        {header}
        <Notice tone={payment.status === 'confirmed' ? 'success' : 'brand'} icon={CheckCircle2} title={t(`pay.${payment.status}Title`)}>
          {payment.status === 'confirmed' ? t(`pay.confirmedBody.${payment.product.status === 'in_review' ? 'review' : 'live'}`) : null}
        </Notice>
        <Button block onClick={() => navigate(`/p/${payment.product.id}`, { replace: true })}>
          {t('sell.done.view')}
        </Button>
      </div>
    );
  }

  if (payment.status === 'rejected') {
    const canResubmit = payment.kind !== 'boost' && payment.product.status === 'rejected';
    return (
      <div className="space-y-4">
        {header}
        <Notice tone="danger" icon={AlertTriangle} title={t('pay.rejectedTitle')}>
          <p>{payment.reject_reason ? t(`rejectReason.${payment.reject_reason}`) : null}</p>
          {payment.admin_note ? <p className="mt-1">“{payment.admin_note}”</p> : null}
        </Notice>
        {canResubmit ? (
          <PrimaryAction
            text={t('pay.fixResubmit')}
            loading={resubmit.isPending}
            onClick={() =>
              resubmit.mutate(payment.product.id, {
                onSuccess: (r) => navigate(r.payment_id ? `/pay/${r.payment_id}` : `/sell/done/${payment.product.id}`, { replace: true }),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          />
        ) : (
          <Button block icon={Wrench} variant="secondary" onClick={() => navigate('/mine', { replace: true })}>
            {t('pay.backToMine')}
          </Button>
        )}
      </div>
    );
  }

  // pending → instructions + reference form
  return (
    <div className="space-y-4">
      {header}
      <Card className="space-y-1 bg-brand text-brand-contrast">
        <p className="text-sm opacity-90">{t('pay.amount')}</p>
        <p className="tabular text-3xl font-bold">{formatEtb(payment.amount_etb)}</p>
        <p className="text-xs opacity-90">{t('pay.amountHint')}</p>
      </Card>

      <Card className="space-y-3">
        <p className="text-sm font-semibold">{t('pay.step1')}</p>
        {[
          { label: t('pay.telebirrNumber'), value: instructions.accountNumber ?? '' },
          { label: t('pay.accountName'), value: instructions.accountName ?? '' },
        ].map((row) => (
          <div key={row.label} className="flex items-center gap-3 rounded-input bg-surface-2 px-3.5 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-hint">{row.label}</p>
              <p className="tabular truncate text-base font-bold">{row.value || '—'}</p>
            </div>
            <Button size="sm" variant="soft" icon={Copy} disabled={!row.value} onClick={() => void copy(row.value)}>
              {t('pay.copy')}
            </Button>
          </div>
        ))}
        <Button variant="secondary" block icon={Smartphone} onClick={() => openExternalLink('https://www.ethiotelecom.et/telebirr/')}>
          {t('pay.openTelebirr')}
        </Button>
      </Card>

      <form noValidate onSubmit={(e) => void onSubmit(e)}>
        <Card className="space-y-3">
          <p className="text-sm font-semibold">{t('pay.step2')}</p>
          <Controller
            control={form.control}
            name="reference"
            render={({ field, fieldState }) => (
              <Input
                label={t('pay.reference')}
                placeholder="CKK12ABC34"
                autoCapitalize="characters"
                autoComplete="off"
                maxLength={40}
                hint={t('pay.referenceHint')}
                error={fieldState.error?.message ? t(fieldState.error.message) : undefined}
                className="font-mono uppercase"
                {...field}
              />
            )}
          />
          <label className="press flex min-h-12 cursor-pointer items-center gap-3 rounded-input border border-dashed border-line px-3.5">
            {uploading ? <Spinner className="size-5 text-brand" /> : <ImagePlus aria-hidden className="size-5 text-brand" />}
            <span className="min-w-0 flex-1 truncate text-sm">{shot ? shot.name : t('pay.screenshot')}</span>
            <span className="text-xs text-hint">{t('common.optional')}</span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setUploading(true);
                uploadPaymentProof(file)
                  .then((path) => setShot({ path, name: file.name }))
                  .catch((err) => toast.error(errorMessage(err)))
                  .finally(() => setUploading(false));
              }}
            />
          </label>
        </Card>
      </form>

      <PrimaryAction text={t('pay.submit')} onClick={() => void onSubmit()} loading={submit.isPending} disabled={uploading} />
    </div>
  );
}
