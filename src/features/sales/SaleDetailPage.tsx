import { Ban, CheckCircle2, Copy, Plus, Share2, Undo2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  ErrorState,
  Input,
  ListGroup,
  ListRow,
  Money,
  Notice,
  PageSkeleton,
  Quantity,
  Section,
  toast,
} from '../../components/ui';
import type { Sale } from '../../lib/api/types';
import { formatDate, formatTime } from '../../lib/format';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { usePermissions, useShopSettings } from '../auth/hooks';
import { useSale, useVoidSale } from './api';
import { ReturnSheet } from './components/ReturnSheet';
import { receiptText } from './receipt';

export default function SaleDetailPage() {
  const { id = '' } = useParams();
  const sale = useSale(id);
  if (sale.isPending) return <PageSkeleton />;
  if (sale.isError) return <ErrorState error={sale.error} onRetry={() => void sale.refetch()} />;
  return <Receipt sale={sale.data} />;
}

function Receipt({ sale }: { sale: Sale }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const justSold = params.get('new') === '1';
  const { isOwner } = usePermissions();
  const settings = useShopSettings();
  const voidSale = useVoidSale();
  const errorMessage = useErrorMessage();
  const [sheet, setSheet] = useState<'void' | 'return' | null>(null);
  const [reason, setReason] = useState('');
  const tz = settings?.timezone;
  const when = `${formatDate(sale.sold_at, i18n.language)} ${formatTime(sale.sold_at, i18n.language, tz)}`;
  const voided = sale.status === 'voided';
  const canReturn = isOwner && !voided && sale.items.some((i) => i.qty > i.returned_qty);

  const text = () => receiptText(sale, { shopName: settings?.shop_name ?? '', footer: settings?.receipt_footer ?? '', date: when, t });
  const share = async () => {
    const body = text();
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text: body });
        return;
      }
    } catch {
      /* cancelled or unsupported: fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(body);
      toast.success(t('receipt.copied'));
    } catch {
      toast.error(t('errors.unsupported'));
    }
  };

  return (
    <div className="space-y-5">
      {justSold ? (
        <Notice tone="success" icon={CheckCircle2} title={t('receipt.done')}>
          {t('receipt.doneBody')}
        </Notice>
      ) : null}

      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold">{t('receipt.title', { no: sale.receipt_no })}</h1>
            <p className="text-sm text-hint">{when}</p>
          </div>
          {voided ? <Badge tone="danger">{t('receipt.voided')}</Badge> : sale.refunded > 0 ? <Badge tone="warning">{t('receipt.partlyReturned')}</Badge> : <Badge tone="success">{t('receipt.completed')}</Badge>}
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-hint">{t('receipt.cashier')}</dt>
            <dd className="font-medium">{sale.cashier_name}</dd>
          </div>
          <div>
            <dt className="text-hint">{t('sell.payment')}</dt>
            <dd className="font-medium">{t(`paymentMethod.${sale.payment_method}`)}</dd>
          </div>
          {sale.customer_name ? (
            <div className="col-span-2">
              <dt className="text-hint">{t('receipt.customer')}</dt>
              <dd>
                {isOwner && sale.customer_id ? (
                  <button type="button" className="press inline-flex items-center gap-1 font-medium text-brand" onClick={() => navigate(`/more/customers/${sale.customer_id}`)}>
                    <UserRound aria-hidden className="size-4" />
                    {sale.customer_name}
                  </button>
                ) : (
                  <span className="font-medium">{sale.customer_name}</span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {sale.note ? <p className="text-sm text-hint">{sale.note}</p> : null}
        {voided && sale.void_reason ? <Notice tone="danger">{t('receipt.voidReason', { reason: sale.void_reason })}</Notice> : null}
      </Card>

      <Section title={t('receipt.items')}>
        <ListGroup>
          {sale.items.map((i) => (
            <ListRow
              key={i.id}
              title={i.product_name}
              subtitle={
                <>
                  <Quantity value={i.qty} unit={i.unit} /> × <Money value={i.unit_price} />
                  {i.discount > 0 ? <> · −<Money value={i.discount} /></> : null}
                  {i.returned_qty > 0 ? <> · {t('receipt.returnedQty', { qty: i.returned_qty })}</> : null}
                </>
              }
              trailing={<Money value={i.line_total} />}
              meta={isOwner && i.line_profit !== undefined ? <Money value={i.line_profit} tone="auto" className="text-xs" /> : undefined}
            />
          ))}
        </ListGroup>
      </Section>

      <Card>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-hint">{t('sell.subtotal')}</dt>
            <dd><Money value={sale.subtotal} /></dd>
          </div>
          {sale.discount > 0 ? (
            <div className="flex justify-between">
              <dt className="text-hint">{t('sell.discount')}</dt>
              <dd className="text-success">−<Money value={sale.discount} /></dd>
            </div>
          ) : null}
          <div className="flex justify-between text-base font-bold">
            <dt>{t('sell.total')}</dt>
            <dd><Money value={sale.total} /></dd>
          </div>
          {sale.refunded > 0 ? (
            <div className="flex justify-between">
              <dt className="text-hint">{t('receipt.refunded')}</dt>
              <dd className="text-danger">−<Money value={sale.refunded} /></dd>
            </div>
          ) : null}
          {isOwner && sale.profit !== undefined && !voided ? (
            <div className="flex justify-between">
              <dt className="text-hint">{t('sell.profit')}</dt>
              <dd><Money value={sale.profit} tone="auto" /></dd>
            </div>
          ) : null}
        </dl>
      </Card>

      {sale.returns.length > 0 ? (
        <Section title={t('receipt.returns')}>
          <ListGroup>
            {sale.returns.map((r) => (
              <ListRow key={r.id} title={r.reason} subtitle={`${formatDate(r.created_at, i18n.language)} ${formatTime(r.created_at, i18n.language, tz)}`} trailing={<Money value={-r.refund_amount} />} />
            ))}
          </ListGroup>
        </Section>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Button icon={typeof navigator.share === 'function' ? Share2 : Copy} variant="secondary" onClick={() => void share()}>
          {t('receipt.share')}
        </Button>
        <Button icon={Plus} onClick={() => navigate('/sell')}>
          {t('receipt.newSale')}
        </Button>
        {canReturn ? (
          <Button variant="secondary" icon={Undo2} onClick={() => setSheet('return')}>
            {t('receipt.return')}
          </Button>
        ) : null}
        {isOwner && !voided ? (
          <Button variant="ghost" icon={Ban} className="text-danger" onClick={() => setSheet('void')}>
            {t('receipt.void')}
          </Button>
        ) : null}
      </div>

      {canReturn ? <ReturnSheet key={sale.refunded} sale={sale} open={sheet === 'return'} onClose={() => setSheet(null)} /> : null}
      <BottomSheet
        open={sheet === 'void'}
        onClose={() => setSheet(null)}
        title={t('receipt.voidTitle')}
        description={t('receipt.voidHint')}
        footer={
          <Button
            block
            variant="danger"
            icon={Ban}
            loading={voidSale.isPending}
            disabled={!reason.trim()}
            onClick={() =>
              voidSale.mutate(
                { id: sale.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(t('receipt.voidedToast'));
                    setSheet(null);
                  },
                  onError: (e) => toast.error(errorMessage(e)),
                },
              )
            }
          >
            {t('receipt.confirmVoid')}
          </Button>
        }
      >
        <Input label={t('receipt.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
      </BottomSheet>
    </div>
  );
}
