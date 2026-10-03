import { useMemo } from 'react';
import { SectionCard, SectionTitle } from '../../components/ui';
import { useProducts } from '../../context/ProductsContext';
import { formatETB } from '../../utils/format';

export function AdminFinance() {
  const { payments } = useProducts();

  const report = useMemo(() => {
    const confirmed = payments.filter((p) => p.status === 'confirmed');
    const rejected = payments.filter((p) => p.status === 'rejected');
    const refunded = payments.filter((p) => p.status === 'refunded');
    const pending = payments.filter(
      (p) => p.status === 'pending' || p.status === 'submitted',
    );

    const income = confirmed.reduce((s, p) => s + p.amount_etb, 0);
    const rejectedAmt = rejected.reduce((s, p) => s + p.amount_etb, 0);
    const refundedAmt = refunded.reduce((s, p) => s + p.amount_etb, 0);
    const pendingAmt = pending.reduce((s, p) => s + p.amount_etb, 0);

    return {
      income,
      rejectedAmt,
      refundedAmt,
      pendingAmt,
      net: income - refundedAmt,
      counts: {
        confirmed: confirmed.length,
        rejected: rejected.length,
        refunded: refunded.length,
        pending: pending.length,
      },
    };
  }, [payments]);

  return (
    <div className="space-y-3.5">
      <SectionCard className="!bg-emerald-600 !text-white">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-white/80">
          Net income
        </p>
        <p className="mt-1 text-[30px] font-bold tabular-nums">{formatETB(report.net)}</p>
        <p className="mt-1 text-[12px] text-white/80">Confirmed listing fees − refunds</p>
      </SectionCard>

      <SectionCard>
        <SectionTitle title="Breakdown" />
        <dl className="space-y-0 divide-y divide-black/8 dark:divide-white/10">
          {[
            {
              label: 'Confirmed income',
              value: formatETB(report.income),
              hint: `${report.counts.confirmed} payments`,
            },
            {
              label: 'In review / unpaid',
              value: formatETB(report.pendingAmt),
              hint: `${report.counts.pending} open`,
            },
            {
              label: 'Rejected',
              value: formatETB(report.rejectedAmt),
              hint: `${report.counts.rejected} (not collected)`,
            },
            {
              label: 'Refunded (loss)',
              value: formatETB(report.refundedAmt),
              hint: `${report.counts.refunded}`,
            },
          ].map((r) => (
            <div key={r.label} className="flex items-baseline justify-between gap-3 py-2.5">
              <div>
                <p className="text-[13px] font-medium">{r.label}</p>
                <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">{r.hint}</p>
              </div>
              <p className="text-[15px] font-bold tabular-nums">{r.value}</p>
            </div>
          ))}
        </dl>
      </SectionCard>
    </div>
  );
}
