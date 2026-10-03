import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { SectionCard, SectionTitle } from '../../components/ui';
import { useProducts } from '../../context/ProductsContext';
import { formatETB } from '../../utils/format';

export function AdminOverview() {
  const { allProducts, payments } = useProducts();

  const stats = useMemo(() => {
    const active = allProducts.filter((p) => p.status === 'active').length;
    const awaiting = payments.filter((p) => p.status === 'submitted');
    const pendingPay = payments.filter(
      (p) => p.status === 'submitted' || p.status === 'pending',
    ).length;
    const income = payments
      .filter((p) => p.status === 'confirmed')
      .reduce((sum, p) => sum + p.amount_etb, 0);
    const lost = payments
      .filter((p) => p.status === 'rejected' || p.status === 'refunded')
      .reduce((sum, p) => sum + p.amount_etb, 0);

    return {
      listings: allProducts.length,
      active,
      pendingPay,
      income,
      lost,
      net: income - lost,
      awaiting,
    };
  }, [allProducts, payments]);

  return (
    <div className="space-y-3.5">
      <SectionCard className="!bg-[var(--tg-theme-button-color,#2481cc)] !text-white !p-4">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-white/75">
          Net income
        </p>
        <p className="mt-1 text-[32px] font-bold tabular-nums leading-none">
          {formatETB(stats.net)}
        </p>
        <p className="mt-2 text-[12px] text-white/80">
          Confirmed fees − refunds · {stats.pendingPay} payment
          {stats.pendingPay === 1 ? '' : 's'} waiting
        </p>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5">
        {[
          { label: 'Live listings', value: String(stats.active), tone: 'text-emerald-600' },
          { label: 'All listings', value: String(stats.listings), tone: '' },
          {
            label: 'Awaiting fee review',
            value: String(stats.pendingPay),
            tone: 'text-amber-600',
          },
          { label: 'Gross income', value: formatETB(stats.income), tone: 'text-[var(--tg-theme-link-color,#2481cc)]' },
        ].map((c) => (
          <SectionCard key={c.label} className="!p-3">
            <p className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              {c.label}
            </p>
            <p className={`mt-1 text-[18px] font-bold tabular-nums ${c.tone}`}>{c.value}</p>
          </SectionCard>
        ))}
      </div>

      <SectionCard>
        <SectionTitle
          title="Needs action"
          action={
            <Link
              to="/admin/payments"
              className="text-[12px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
            >
              See all
            </Link>
          }
        />
        {stats.awaiting.length === 0 ? (
          <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
            No Telebirr references waiting. New seller payments will show here.
          </p>
        ) : (
          <ul className="space-y-2">
            {stats.awaiting.slice(0, 4).map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">Ref: {p.reference || '—'}</p>
                  <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                    Seller {p.telegram_id}
                  </p>
                </div>
                <p className="shrink-0 text-[14px] font-bold tabular-nums text-[var(--tg-theme-link-color,#2481cc)]">
                  {formatETB(p.amount_etb)}
                </p>
              </li>
            ))}
          </ul>
        )}
        <Link
          to="/admin/payments"
          className="mt-3 block rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] py-3 text-center text-[15px] font-semibold text-white"
        >
          Review payments
        </Link>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5">
        <Link
          to="/admin/products"
          className="rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#fff)] px-3 py-3 text-center text-[13px] font-semibold ring-1 ring-black/[0.04]"
        >
          Manage listings
        </Link>
        <Link
          to="/admin/finance"
          className="rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#fff)] px-3 py-3 text-center text-[13px] font-semibold ring-1 ring-black/[0.04]"
        >
          Money report
        </Link>
      </div>
    </div>
  );
}
