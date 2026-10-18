import { AlertTriangle, BadgePercent, CheckCircle2, Trash2, UserRound, X } from 'lucide-react';
import { useState, type Dispatch } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  BottomSheet,
  Button,
  Chip,
  IconButton,
  Input,
  Money,
  Notice,
  NumberInput,
  QtyStepper,
  Quantity,
  toast,
} from '../../../components/ui';
import { toAppError } from '../../../lib/api/errors';
import { PAYMENT_METHODS } from '../../../lib/api/types';
import { haptic } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useOnline } from '../../../lib/useOnline';
import { usePermissions, useShopSettings } from '../../auth/hooks';
import { isWholeUnit } from '../../products/logic';
import { useRecordSale } from '../../sales/api';
import { cartProblems, cartTotals, lineTotal } from '../logic';
import type { CartState } from '../useCart';
import type { cartReducer } from '../useCart';
import { CustomerPicker } from './CustomerPicker';

type Dispatcher = Dispatch<Parameters<typeof cartReducer>[1]>;

export function CartSheet({ open, onClose, cart, dispatch }: { open: boolean; onClose: () => void; cart: CartState; dispatch: Dispatcher }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const online = useOnline();
  const settings = useShopSettings();
  const { canSeeCost, isOwner } = usePermissions();
  const record = useRecordSale();
  const errorMessage = useErrorMessage();
  const [picking, setPicking] = useState(false);
  const [showExtras, setShowExtras] = useState(false);
  const allowNegative = Boolean(settings?.allow_negative_stock);
  const totals = cartTotals(cart.lines, cart.discount);
  const problems = cartProblems(cart.lines, cart.discount, allowNegative);
  const needsCustomer = cart.paymentMethod === 'credit' && !cart.customer;
  const belowCost = canSeeCost && totals.profit !== null && totals.profit < 0;

  const complete = () => {
    if (!problems.ok || needsCustomer) return;
    record.mutate(
      {
        clientRef: cart.clientRef,
        items: cart.lines.map((l) => ({ product_id: l.product.id, qty: l.qty, ...(l.discount ? { discount: l.discount } : {}) })),
        paymentMethod: cart.paymentMethod,
        discount: totals.discount,
        note: cart.note,
        customerId: cart.customer?.id ?? null,
      },
      {
        onSuccess: (sale) => {
          haptic.notify('success');
          dispatch({ type: 'clear' });
          onClose();
          navigate(`/sales/${sale.id}?new=1`);
        },
        onError: (e) => {
          // A network failure may have committed: keep the cart (same clientRef) so a retry is safe.
          const code = toAppError(e).code;
          toast.error(code === 'network' ? t('sell.networkRetry') : errorMessage(e));
        },
      },
    );
  };

  return (
    <>
      <BottomSheet
        open={open && !picking}
        onClose={onClose}
        title={t('sell.cartTitle', { count: cart.lines.length })}
        size="tall"
        footer={
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-hint">{t('sell.total')}</span>
              <Money value={totals.total} className="text-2xl font-bold" />
            </div>
            {!online ? <p className="text-xs font-semibold text-danger">{t('sell.offline')}</p> : null}
            <Button
              block
              size="lg"
              icon={CheckCircle2}
              loading={record.isPending}
              disabled={!online || !problems.ok || needsCustomer}
              onClick={complete}
            >
              {needsCustomer ? t('sell.pickCustomerFirst') : t('sell.complete')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4 pt-1">
          <ul className="divide-y divide-line">
            {cart.lines.map((l) => {
              const problem = problems.byLine.get(l.product.id);
              return (
                <li key={l.product.id} className="py-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{l.product.name}</p>
                      <p className="text-xs text-hint">
                        <Money value={l.product.sell_price} /> / {t(`unitShort.${l.product.unit}`, { count: 1 })} · {t('sell.inStock')}{' '}
                        <Quantity value={l.product.stock_qty} unit={l.product.unit} />
                      </p>
                    </div>
                    <IconButton icon={Trash2} size="sm" label={t('sell.remove')} onClick={() => dispatch({ type: 'remove', productId: l.product.id })} />
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {isWholeUnit(l.product.unit) ? (
                      <QtyStepper
                        label={t('sell.qtyFor', { name: l.product.name })}
                        value={l.qty}
                        onChange={(qty) => dispatch({ type: 'setQty', productId: l.product.id, qty })}
                        {...(allowNegative ? {} : { max: l.product.stock_qty })}
                      />
                    ) : (
                      <div className="w-36">
                        <NumberInput
                          size="md"
                          decimals={3}
                          suffix={t(`unitShort.${l.product.unit}`, { count: 2 })}
                          value={l.qty}
                          onChange={(qty) => dispatch({ type: 'setQty', productId: l.product.id, qty: qty ?? 0 })}
                        />
                      </div>
                    )}
                    <div className="text-right">
                      <Money value={lineTotal(l)} className="font-bold" />
                    </div>
                  </div>
                  {problem ? (
                    <p role="alert" className="mt-1 flex items-center gap-1 text-xs font-semibold text-danger">
                      <AlertTriangle aria-hidden className="size-3.5" />
                      {t(`sell.problem.${problem}`)}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">{t('sell.payment')}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('sell.payment')}>
              {PAYMENT_METHODS.map((m) => (
                <Chip key={m} role="radio" aria-checked={cart.paymentMethod === m} selected={cart.paymentMethod === m} onClick={() => dispatch({ type: 'setPayment', method: m })}>
                  {t(`paymentMethod.${m}`)}
                </Chip>
              ))}
            </div>
          </fieldset>

          {cart.paymentMethod === 'credit' || cart.customer ? (
            <>
              <div className="flex items-center gap-2">
                <Button variant={cart.customer ? 'soft' : 'secondary'} icon={UserRound} onClick={() => setPicking(true)} className="flex-1 justify-start">
                  {cart.customer ? cart.customer.name : t('sell.pickCustomer')}
                </Button>
                {cart.customer ? <IconButton icon={X} label={t('sell.removeCustomer')} onClick={() => dispatch({ type: 'setCustomer', customer: null })} /> : null}
              </div>
              {cart.customer && cart.customer.balance > 0 ? (
                <p className="text-xs text-warning">
                  {t('sell.customerOwes')} <Money value={cart.customer.balance} />
                </p>
              ) : null}
            </>
          ) : null}

          {showExtras || cart.discount > 0 || cart.note ? (
            <>
              <NumberInput
                size="md"
                label={t('sell.saleDiscount')}
                prefix="ETB"
                decimals={2}
                value={cart.discount || null}
                onChange={(d) => dispatch({ type: 'setDiscount', discount: d ?? 0 })}
                error={problems.saleDiscountInvalid ? t('sell.problem.discount') : undefined}
              />
              <Input label={t('sell.note')} optionalLabel={t('common.optional')} maxLength={300} value={cart.note} onChange={(e) => dispatch({ type: 'setNote', note: e.target.value })} />
            </>
          ) : (
            <button type="button" className="press inline-flex items-center gap-1 text-sm font-semibold text-brand" onClick={() => setShowExtras(true)}>
              <BadgePercent aria-hidden className="size-4" />
              {t('sell.addDiscount')}
            </button>
          )}

          {totals.discount > 0 ? (
            <dl className="space-y-1 rounded-card bg-surface-2 p-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-hint">{t('sell.subtotal')}</dt>
                <dd><Money value={totals.subtotal} /></dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-hint">{t('sell.discount')}</dt>
                <dd className="text-success">−<Money value={totals.discount} /></dd>
              </div>
            </dl>
          ) : null}
          {belowCost ? (
            <Notice tone="warning" icon={AlertTriangle}>
              {isOwner ? t('sell.belowCostOwner') : t('sell.belowCostStaff')}
            </Notice>
          ) : null}
        </div>
      </BottomSheet>
      <CustomerPicker
        open={open && picking}
        onClose={() => setPicking(false)}
        onPick={(c) => {
          dispatch({ type: 'setCustomer', customer: { id: c.id, name: c.name, balance: c.balance } });
          setPicking(false);
        }}
      />
    </>
  );
}
