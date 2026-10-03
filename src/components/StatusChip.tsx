import type { ProductStatus } from '../types/product';
import type { PaymentStatus } from '../types/payment';

const PRODUCT_STYLES: Record<ProductStatus, string> = {
  draft: 'bg-black/10 text-[var(--tg-theme-hint-color,#8e8e93)]',
  pending_payment: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  payment_submitted: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  active: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-300',
  sold: 'bg-violet-500/15 text-violet-800 dark:text-violet-300',
  hidden: 'bg-black/10 text-[var(--tg-theme-hint-color,#8e8e93)]',
};

const PRODUCT_LABELS: Record<ProductStatus, string> = {
  draft: 'Draft',
  pending_payment: 'Pay fee',
  payment_submitted: 'Awaiting review',
  active: 'Live',
  rejected: 'Rejected',
  sold: 'Sold',
  hidden: 'Hidden',
};

export function ProductStatusChip({ status }: { status: ProductStatus }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold ${PRODUCT_STYLES[status]}`}
    >
      {PRODUCT_LABELS[status]}
    </span>
  );
}

const PAY_STYLES: Record<PaymentStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-800 dark:text-amber-300',
  submitted: 'bg-sky-500/15 text-sky-800 dark:text-sky-300',
  confirmed: 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300',
  rejected: 'bg-red-500/15 text-red-700 dark:text-red-300',
  refunded: 'bg-black/10 text-[var(--tg-theme-hint-color,#8e8e93)]',
};

export function PaymentStatusChip({ status }: { status: PaymentStatus }) {
  return (
    <span
      className={`inline-flex rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${PAY_STYLES[status]}`}
    >
      {status}
    </span>
  );
}
