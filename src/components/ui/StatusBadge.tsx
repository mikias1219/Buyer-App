import { useTranslation } from 'react-i18next';
import type { ListingStatus, PaymentStatus } from '../../lib/api/types';
import { Badge, type BadgeTone } from './Badge';

const LISTING_TONE: Record<ListingStatus, BadgeTone> = {
  draft: 'neutral',
  pending_payment: 'warning',
  payment_submitted: 'brand',
  in_review: 'brand',
  active: 'success',
  paused: 'neutral',
  sold: 'neutral',
  expired: 'warning',
  rejected: 'danger',
  removed: 'danger',
};

const PAYMENT_TONE: Record<PaymentStatus, BadgeTone> = {
  pending: 'warning',
  submitted: 'brand',
  confirmed: 'success',
  rejected: 'danger',
  refunded: 'neutral',
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  const { t } = useTranslation();
  return <Badge tone={LISTING_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const { t } = useTranslation();
  return <Badge tone={PAYMENT_TONE[status]}>{t(`paymentStatus.${status}`)}</Badge>;
}
