import { Undo2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Input, Money, NumberInput, QtyStepper, Quantity, toast } from '../../../components/ui';
import type { Sale } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { isValidQty, isWholeUnit } from '../../products/logic';
import { refundFor } from '../../sell/logic';
import { useReturnItems } from '../api';

export function ReturnSheet({ sale, open, onClose }: { sale: Sale; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const ret = useReturnItems();
  const errorMessage = useErrorMessage();
  const [qtys, setQtys] = useState<Record<number, number>>({});
  const [reason, setReason] = useState('');
  const returnable = sale.items.filter((i) => i.qty > i.returned_qty);
  const picked = returnable.filter((i) => (qtys[i.id] ?? 0) > 0);
  const valid = picked.length > 0 && reason.trim().length > 0 && picked.every((i) => isValidQty(i.unit, qtys[i.id] ?? 0) && (qtys[i.id] ?? 0) <= i.qty - i.returned_qty);
  // Estimate only (each line's share of the sale discount); the database computes the exact refund.
  const estimate = picked.reduce(
    (sum, i) => sum + refundFor({ lineTotal: i.line_total, lineQty: i.qty, returnedQty: 0, alreadyRefunded: 0, saleTotal: sale.total, saleSubtotal: sale.subtotal, qty: Math.min(qtys[i.id] ?? 0, i.qty - 1e-9) }),
    0,
  );

  const submit = () =>
    ret.mutate(
      { saleId: sale.id, items: picked.map((i) => ({ sale_item_id: i.id, qty: qtys[i.id] ?? 0 })), reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success(t('receipt.returned'));
          setQtys({});
          setReason('');
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('receipt.returnTitle')}
      description={t('receipt.returnHint')}
      footer={
        <div className="space-y-2">
          {picked.length > 0 ? (
            <p className="flex justify-between text-sm">
              <span className="text-hint">{t('receipt.refundEstimate')}</span>
              <Money value={Math.round(estimate * 100) / 100} className="font-bold" />
            </p>
          ) : null}
          <Button block icon={Undo2} loading={ret.isPending} disabled={!valid} onClick={submit}>
            {t('receipt.confirmReturn')}
          </Button>
        </div>
      }
    >
      <ul className="divide-y divide-line">
        {returnable.map((i) => {
          const max = i.qty - i.returned_qty;
          return (
            <li key={i.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold">{i.product_name}</p>
                <p className="text-xs text-hint">
                  {t('receipt.canReturn')} <Quantity value={max} unit={i.unit} />
                </p>
              </div>
              {isWholeUnit(i.unit) ? (
                <QtyStepper label={t('sell.qtyFor', { name: i.product_name })} value={qtys[i.id] ?? 0} max={max} onChange={(v) => setQtys({ ...qtys, [i.id]: Math.max(0, v) })} />
              ) : (
                <div className="w-32">
                  <NumberInput size="md" decimals={3} max={max} value={qtys[i.id] ?? null} onChange={(v) => setQtys({ ...qtys, [i.id]: v ?? 0 })} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Input label={t('receipt.reason')} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
    </BottomSheet>
  );
}
