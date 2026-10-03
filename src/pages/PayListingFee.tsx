import { useMemo, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { PaymentSteps } from '../components/PaymentSteps';
import { PaymentStatusChip, ProductStatusChip } from '../components/StatusChip';
import { RequireProfile } from '../components/RequireProfile';
import {
  PageHeader,
  PrimaryButton,
  SectionCard,
  SectionTitle,
  fieldClass,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useTelegramContext } from '../context/TelegramContext';
import { formatETB } from '../utils/format';

function PayInner() {
  const { id } = useParams<{ id: string }>();
  const { settings } = useAuth();
  const { getProductById, payments, submitListingPayment } = useProducts();
  const { tg } = useTelegramContext();
  const product = id ? getProductById(id) : undefined;
  const payment = useMemo(
    () =>
      payments.find(
        (p) => p.id === product?.payment_id || p.product_id === product?.id,
      ),
    [payments, product],
  );

  const [reference, setReference] = useState(payment?.reference || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!product) {
    return (
      <SectionCard className="py-10 text-center">
        <p className="font-semibold">Listing not found</p>
        <Link
          to="/my-listings"
          className="mt-2 inline-block text-[var(--tg-theme-link-color,#2481cc)]"
        >
          Back
        </Link>
      </SectionCard>
    );
  }

  if (product.status === 'active') {
    return <Navigate to={`/product/${product.id}`} replace />;
  }

  async function copyText(label: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      tg?.showAlert?.(`${label} copied`);
    } catch {
      tg?.showAlert?.(value);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (reference.trim().length < 4) {
      setError('Enter your Telebirr transaction reference (at least 4 characters).');
      return;
    }
    setSubmitting(true);
    setError(null);
    const ok = await submitListingPayment(product!.id, reference);
    setSubmitting(false);
    if (!ok) {
      setError('Could not submit payment. Try again.');
      return;
    }
    setDone(true);
    tg?.showAlert?.('Payment submitted. Wait for admin confirmation.');
  }

  const fee = product.listing_fee_etb || settings.listing_fee_etb;
  const locked =
    product.status === 'payment_submitted' ||
    payment?.status === 'submitted' ||
    payment?.status === 'confirmed' ||
    done;

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Pay listing fee"
        subtitle="Required before buyers can see your contact"
        action={
          <Link
            to="/my-listings"
            className="rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] px-3 py-2 text-[13px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
          >
            Mine
          </Link>
        }
      />

      <PaymentSteps current={locked ? 3 : 2} />

      <SectionCard className="!bg-[var(--tg-theme-button-color,#2481cc)] !text-white">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-white/80">
          Why pay?
        </p>
        <p className="mt-1 text-[14px] leading-snug text-white/95">
          Until this fee is confirmed, your listing stays private and your Telegram contact
          is hidden from other users.
        </p>
        <p className="mt-3 text-[28px] font-bold tabular-nums">{formatETB(fee)}</p>
        <p className="text-[12px] text-white/80">One-time fee per listing · Telebirr</p>
      </SectionCard>

      <SectionCard>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{product.title}</p>
            <p className="mt-0.5 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
              {formatETB(product.price)} asking price
            </p>
          </div>
          <ProductStatusChip status={done ? 'payment_submitted' : product.status} />
        </div>
        {payment && (
          <div className="mt-2">
            <PaymentStatusChip status={done ? 'submitted' : payment.status} />
          </div>
        )}
      </SectionCard>

      <SectionCard>
        <SectionTitle title="Step 2A — Send Telebirr" />
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => copyText('Number', settings.telebirr_number)}
            className="flex w-full items-center justify-between rounded-2xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3.5 py-3 text-left"
          >
            <span>
              <span className="block text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                1. Telebirr number
              </span>
              <span className="text-[18px] font-bold tabular-nums">
                {settings.telebirr_number}
              </span>
            </span>
            <span className="rounded-lg bg-[var(--tg-theme-button-color,#2481cc)] px-2.5 py-1.5 text-[12px] font-semibold text-white">
              Copy
            </span>
          </button>
          <button
            type="button"
            onClick={() => copyText('Name', settings.telebirr_name)}
            className="flex w-full items-center justify-between rounded-2xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3.5 py-3 text-left"
          >
            <span>
              <span className="block text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                2. Account name
              </span>
              <span className="text-[16px] font-bold">{settings.telebirr_name}</span>
            </span>
            <span className="rounded-lg bg-[var(--tg-theme-button-color,#2481cc)] px-2.5 py-1.5 text-[12px] font-semibold text-white">
              Copy
            </span>
          </button>
          <p className="text-[12px] leading-snug text-[var(--tg-theme-hint-color,#8e8e93)]">
            Send exactly <strong>{formatETB(fee)}</strong> then come back here.
          </p>
        </div>
      </SectionCard>

      {locked ? (
        <SectionCard className="!bg-emerald-500/12">
          <p className="text-[15px] font-semibold text-emerald-900 dark:text-emerald-100">
            Step 3 — Waiting for admin
          </p>
          <p className="mt-1 text-[13px] leading-snug text-emerald-900/80 dark:text-emerald-100/80">
            Reference received
            {reference || payment?.reference
              ? `: ${reference || payment?.reference}`
              : ''}
            . After confirmation, your item goes live and buyers can contact you.
          </p>
        </SectionCard>
      ) : (
        <SectionCard>
          <SectionTitle title="Step 2B — Paste reference" />
          <form onSubmit={onSubmit} className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                Telebirr / SMS transaction ID
              </span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="e.g. CKK12ABC34"
                className={fieldClass}
                required
              />
            </label>
            {error && (
              <p className="text-[13px] text-[var(--tg-theme-destructive-text-color,#ff3b30)]">
                {error}
              </p>
            )}
            <PrimaryButton type="submit" disabled={submitting}>
              {submitting ? 'Submitting…' : 'I paid — submit for review'}
            </PrimaryButton>
          </form>
        </SectionCard>
      )}
    </div>
  );
}

export function PayListingFee() {
  return (
    <RequireProfile>
      <PayInner />
    </RequireProfile>
  );
}
