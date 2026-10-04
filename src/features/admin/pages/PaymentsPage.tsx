import { AlertTriangle, Check, Copy, CreditCard, Image as ImageIcon, RotateCcw, Search, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, ErrorState, Input, ListingRow, ListingRowSkeleton, PaymentStatusBadge, Tabs, toast } from '../../../components/ui';
import { PAYMENT_REJECT_REASONS, type AdminPayment } from '../../../lib/api/types';
import { formatEtb, formatRelative } from '../../../lib/format';
import { haptic, openExternalLink, showConfirm } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { paymentProofUrl, useAdminPayments, useConfirmPayment, useRefundPayment, useRejectPayment } from '../api';
import { ReasonSheet } from '../components/ReasonSheet';
import { SlaBadge } from '../components/SlaBadge';

const FILTERS = ['submitted', 'confirmed', 'rejected', 'refunded', 'all'] as const;
type Filter = (typeof FILTERS)[number];

export default function PaymentsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<Filter>('submitted');
  const [search, setSearch] = useState('');
  const payments = useAdminPayments(filter, search.trim());
  const [rejecting, setRejecting] = useState<AdminPayment | null>(null);
  const reject = useRejectPayment();
  const errorMessage = useErrorMessage();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('admin.payments.title')}</h1>
      <Tabs label={t('admin.payments.filter')} value={filter} onChange={setFilter} items={FILTERS.map((f) => ({ value: f, label: t(`admin.payments.filters.${f}`) }))} />
      <Input leading={<Search aria-hidden className="size-5" />} placeholder={t('admin.payments.search')} value={search} onChange={(e) => setSearch(e.target.value)} aria-label={t('admin.payments.search')} />
      {payments.isPending ? (
        <div className="space-y-2">
          <ListingRowSkeleton />
          <ListingRowSkeleton />
        </div>
      ) : payments.isError ? (
        <ErrorState error={payments.error} onRetry={() => void payments.refetch()} />
      ) : payments.data.length === 0 ? (
        <EmptyState icon={CreditCard} title={filter === 'submitted' ? t('admin.payments.emptyWaiting') : t('admin.payments.empty')} />
      ) : (
        <ul className="space-y-2.5">
          {payments.data.map((p) => (
            <li key={p.id}>
              <PaymentCard payment={p} onReject={() => setRejecting(p)} />
            </li>
          ))}
        </ul>
      )}
      {rejecting ? (
        <ReasonSheet
          open
          title={t('admin.payments.rejectTitle', { reference: rejecting.reference })}
          reasons={PAYMENT_REJECT_REASONS}
          confirmLabel={t('admin.payments.reject')}
          loading={reject.isPending}
          onClose={() => setRejecting(null)}
          onConfirm={(reason, note) =>
            reject.mutate(
              { id: rejecting.id, reason, note },
              {
                onSuccess: () => {
                  toast.success(t('admin.payments.rejected'));
                  setRejecting(null);
                },
                onError: (e) => toast.error(errorMessage(e)),
              },
            )
          }
        />
      ) : null}
    </div>
  );
}

function PaymentCard({ payment: p, onReject }: { payment: AdminPayment; onReject: () => void }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const confirm = useConfirmPayment();
  const refund = useRefundPayment();

  const doConfirm = async () => {
    if (p.duplicate_count > 0 && !(await showConfirm(t('admin.payments.duplicateConfirm')))) return;
    haptic.impact('medium');
    confirm.mutate(p.id, { onSuccess: () => toast.success(t('admin.payments.confirmed')), onError: (e) => toast.error(errorMessage(e)) });
  };
  const doRefund = async () => {
    if (!(await showConfirm(t('admin.payments.refundConfirm', { amount: formatEtb(p.amount_etb) })))) return;
    refund.mutate({ id: p.id }, { onSuccess: () => toast.success(t('admin.payments.refunded')), onError: (e) => toast.error(errorMessage(e)) });
  };
  const viewProof = async () => {
    try {
      const url = await paymentProofUrl(p.id);
      if (url) openExternalLink(url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <ListingRow
      title={p.product.title}
      price={p.product.price}
      coverPath={p.product.cover_path}
      badge={<PaymentStatusBadge status={p.status} />}
      meta={
        <span>
          {p.seller.name}
          {p.seller.username ? ` @${p.seller.username}` : ''} · {t(`admin.payments.kind.${p.kind}`)}
        </span>
      }
    >
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 rounded-input bg-surface-2 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-hint">{t('pay.reference')}</p>
            <p className="tabular truncate font-mono text-base font-bold">{p.reference || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-hint">{t('pay.amount')}</p>
            <p className="tabular font-bold">{formatEtb(p.amount_etb)}</p>
          </div>
          {p.reference ? (
            <Button
              size="sm"
              variant="ghost"
              icon={Copy}
              aria-label={t('pay.copy')}
              onClick={() => void navigator.clipboard?.writeText(p.reference).then(() => toast.success(t('pay.copied')))}
            />
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {p.status === 'submitted' ? <SlaBadge since={p.submitted_at} /> : <Badge>{formatRelative(p.reviewed_at ?? p.created_at, i18n.language)}</Badge>}
          {p.duplicate_count > 0 ? (
            <Badge tone="danger" icon={AlertTriangle}>
              {t('admin.payments.duplicate', { count: p.duplicate_count })}
            </Badge>
          ) : null}
          {p.reject_reason ? <Badge tone="danger">{t(`rejectReason.${p.reject_reason}`)}</Badge> : null}
          <Link to={`/p/${p.product.id}`} className="ml-auto text-xs font-semibold text-brand">
            {t('admin.viewListing')}
          </Link>
        </div>
        {p.status === 'submitted' ? (
          <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
            <Button variant="secondary" icon={ImageIcon} disabled={!p.has_screenshot} onClick={() => void viewProof()} aria-label={t('admin.payments.screenshot')} />
            <Button variant="danger" icon={X} onClick={onReject}>
              {t('admin.payments.reject')}
            </Button>
            <Button icon={Check} loading={confirm.isPending} onClick={() => void doConfirm()}>
              {t('admin.payments.confirm')}
            </Button>
          </div>
        ) : p.status === 'confirmed' ? (
          <Button size="sm" variant="secondary" icon={RotateCcw} loading={refund.isPending} onClick={() => void doRefund()}>
            {t('admin.payments.refund')}
          </Button>
        ) : null}
      </div>
    </ListingRow>
  );
}
