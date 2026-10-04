import { ProductStatusChip } from '../../components/StatusChip';
import { SectionCard, SectionTitle } from '../../components/ui';
import { useProducts } from '../../context/ProductsContext';
import { formatETB } from '../../utils/format';

export function AdminProducts() {
  const { allProducts, adminSetProductStatus } = useProducts();

  const live = allProducts.filter((p) => p.status === 'active');
  const other = allProducts.filter((p) => p.status !== 'active');

  function Row({
    p,
  }: {
    p: (typeof allProducts)[number];
  }) {
    return (
      <SectionCard className="!p-3 space-y-2.5">
        <div className="flex gap-3">
          <img
            src={p.image_url}
            alt=""
            className="h-16 w-16 rounded-xl object-cover ring-1 ring-black/[0.06]"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-[14px] font-semibold leading-snug">{p.title}</p>
              <ProductStatusChip status={p.status} />
            </div>
            <p className="mt-1 text-[14px] font-bold text-[var(--tg-theme-link-color,#2481cc)]">
              {formatETB(p.price)}
            </p>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">
              @{p.seller_username || p.seller_id}
              {p.city ? ` · ${p.city}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {p.status !== 'active' && (
            <button
              type="button"
              onClick={() => void adminSetProductStatus(p.id, 'active')}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white"
            >
              Publish (show contact)
            </button>
          )}
          <button
            type="button"
            onClick={() => void adminSetProductStatus(p.id, 'hidden')}
            className="rounded-lg bg-[var(--tg-theme-bg-color,#efeff4)] px-2.5 py-1.5 text-[11px] font-semibold"
          >
            Hide
          </button>
          <button
            type="button"
            onClick={() => void adminSetProductStatus(p.id, 'rejected')}
            className="rounded-lg bg-red-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-red-700 dark:text-red-300"
          >
            Reject
          </button>
          <button
            type="button"
            onClick={() => void adminSetProductStatus(p.id, 'sold')}
            className="rounded-lg bg-violet-500/15 px-2.5 py-1.5 text-[11px] font-semibold text-violet-800 dark:text-violet-300"
          >
            Sold
          </button>
        </div>
      </SectionCard>
    );
  }

  return (
    <div className="space-y-3.5">
      <SectionCard className="!py-3">
        <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Only <strong>live</strong> listings show seller contact to buyers.
        </p>
      </SectionCard>

      <section className="space-y-2">
        <SectionTitle title={`Live (${live.length})`} />
        {live.length === 0 ? (
          <SectionCard>
            <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
              No live listings.
            </p>
          </SectionCard>
        ) : (
          live.map((p) => <Row key={p.id} p={p} />)
        )}
      </section>

      <section className="space-y-2">
        <SectionTitle title={`Not public (${other.length})`} />
        {other.map((p) => (
          <Row key={p.id} p={p} />
        ))}
      </section>
    </div>
  );
}
