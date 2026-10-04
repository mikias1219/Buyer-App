import { PaymentStatusChip } from '../../components/StatusChip';
import { SectionCard, SectionTitle } from '../../components/ui';
import { useProducts } from '../../context/ProductsContext';
import { formatETB } from '../../utils/format';

export function AdminPayments() {
  const { payments, getProductById, adminSetPaymentStatus } = useProducts();

  const queued = payments.filter((p) => p.status === 'submitted' || p.status === 'pending');
  const others = payments.filter((p) => p.status !== 'submitted' && p.status !== 'pending');

  return (
    <div className="space-y-3.5">
      <SectionCard className="!py-3">
        <p className="text-[13px] leading-snug text-[var(--tg-theme-hint-color,#8e8e93)]">
          Confirm only after you receive Telebirr. Confirming unlocks seller contact for buyers.
        </p>
      </SectionCard>

      <section className="space-y-2">
        <SectionTitle title={`Queue (${queued.length})`} />
        {queued.length === 0 ? (
          <SectionCard>
            <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
              No payments waiting.
            </p>
          </SectionCard>
        ) : (
          queued.map((pay) => {
            const product = getProductById(pay.product_id);
            return (
              <SectionCard key={pay.id} className="!p-3 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold">
                      {product?.title || 'Listing'}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                      Seller ID {pay.telegram_id}
                    </p>
                  </div>
                  <PaymentStatusChip status={pay.status} />
                </div>
                <div className="rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3 py-2.5">
                  <p className="text-[11px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
                    Telebirr reference
                  </p>
                  <p className="text-[16px] font-bold tracking-wide">
                    {pay.reference || '— not submitted —'}
                  </p>
                  <p className="mt-1 text-[14px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]">
                    {formatETB(pay.amount_etb)}
                  </p>
                </div>
                {pay.status === 'submitted' || pay.reference ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => void adminSetPaymentStatus(pay.id, 'confirmed')}
                      className="rounded-xl bg-emerald-600 py-2.5 text-[13px] font-semibold text-white"
                    >
                      Confirm & publish
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void adminSetPaymentStatus(pay.id, 'rejected', 'Invalid reference')
                      }
                      className="rounded-xl bg-red-500 py-2.5 text-[13px] font-semibold text-white"
                    >
                      Reject
                    </button>
                  </div>
                ) : (
                  <p className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                    Seller has not pasted a reference yet.
                  </p>
                )}
              </SectionCard>
            );
          })
        )}
      </section>

      {others.length > 0 && (
        <section className="space-y-2">
          <SectionTitle title="History" />
          {others.map((pay) => {
            const product = getProductById(pay.product_id);
            return (
              <SectionCard key={pay.id} className="!p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold">
                      {product?.title || pay.product_id}
                    </p>
                    <p className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                      {pay.reference || '—'} · {formatETB(pay.amount_etb)}
                    </p>
                  </div>
                  <PaymentStatusChip status={pay.status} />
                </div>
                {pay.status === 'confirmed' && (
                  <button
                    type="button"
                    onClick={() => void adminSetPaymentStatus(pay.id, 'refunded', 'Refunded')}
                    className="mt-2 w-full rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)] py-2 text-[12px] font-semibold"
                  >
                    Mark refunded
                  </button>
                )}
              </SectionCard>
            );
          })}
        </section>
      )}
    </div>
  );
}
