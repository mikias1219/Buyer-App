import type { TFunction } from 'i18next';
import type { Sale } from '../../lib/api/types';
import { formatEtb, formatNumber } from '../../lib/format';

/** Plain-text receipt for sharing (Telegram message, SMS, clipboard). */
export function receiptText(sale: Sale, opts: { shopName: string; footer: string; date: string; t: TFunction }): string {
  const { t } = opts;
  const lines = [
    opts.shopName || t('app.name'),
    `${t('receipt.title', { no: sale.receipt_no })} · ${opts.date}`,
    '',
    ...sale.items.map((i) => {
      const unit = t(`unitShort.${i.unit}`, { count: i.qty });
      const disc = i.discount > 0 ? ` (−${formatEtb(i.discount)})` : '';
      return `${i.product_name}\n  ${formatNumber(i.qty)} ${unit} × ${formatEtb(i.unit_price)}${disc} = ${formatEtb(i.line_total)}`;
    }),
    '',
    ...(sale.discount > 0 ? [`${t('sell.subtotal')}: ${formatEtb(sale.subtotal)}`, `${t('sell.discount')}: −${formatEtb(sale.discount)}`] : []),
    `${t('sell.total')}: ${formatEtb(sale.total)}`,
    `${t('sell.payment')}: ${t(`paymentMethod.${sale.payment_method}`)}${sale.customer_name ? ` · ${sale.customer_name}` : ''}`,
    ...(sale.refunded > 0 ? [`${t('receipt.refunded')}: −${formatEtb(sale.refunded)}`] : []),
    ...(sale.status === 'voided' ? [t('receipt.voidedStamp')] : []),
    ...(opts.footer ? ['', opts.footer] : []),
  ];
  return lines.join('\n');
}
