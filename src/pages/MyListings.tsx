import { Link } from 'react-router-dom';
import { ProductStatusChip } from '../components/StatusChip';
import { RequireProfile } from '../components/RequireProfile';
import { PageHeader, PrimaryButton, SectionCard } from '../components/ui';
import { useProducts } from '../context/ProductsContext';
import { formatETB } from '../utils/format';

function MyListingsInner() {
  const { myProducts, loading } = useProducts();

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#fff)]"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="My listings"
        subtitle="Track fees, review status, and go live"
        action={
          <Link
            to="/add"
            className="rounded-xl bg-[var(--tg-theme-button-color,#2481cc)] px-3 py-2 text-[13px] font-semibold text-white"
          >
            + Sell
          </Link>
        }
      />

      {myProducts.length === 0 ? (
        <SectionCard className="py-12 text-center">
          <p className="text-[16px] font-semibold">No listings yet</p>
          <p className="mt-1 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
            Post your first phone or laptop in a minute.
          </p>
          <div className="mx-auto mt-4 max-w-xs">
            <Link to="/add">
              <PrimaryButton type="button">Sell an item</PrimaryButton>
            </Link>
          </div>
        </SectionCard>
      ) : (
        <ul className="space-y-2.5">
          {myProducts.map((item) => (
            <li key={item.id}>
              <SectionCard className="!p-3">
                <div className="flex gap-3">
                  <img
                    src={item.image_url}
                    alt=""
                    className="h-[72px] w-[72px] shrink-0 rounded-xl object-cover ring-1 ring-black/[0.06]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="line-clamp-2 text-[15px] font-semibold leading-snug">
                        {item.title}
                      </p>
                      <ProductStatusChip status={item.status} />
                    </div>
                    <p className="mt-1 text-[15px] font-bold tabular-nums text-[var(--tg-theme-link-color,#2481cc)]">
                      {formatETB(item.price)}
                    </p>
                    <p className="mt-0.5 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                      {[item.brand, item.city, item.category].filter(Boolean).join(' · ')}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {(item.status === 'pending_payment' ||
                        item.status === 'payment_submitted') && (
                        <Link
                          to={`/pay/${item.id}`}
                          className="rounded-lg bg-[var(--tg-theme-button-color,#2481cc)] px-2.5 py-1.5 text-[12px] font-semibold text-white"
                        >
                          {item.status === 'pending_payment'
                            ? 'Pay listing fee'
                            : 'View payment'}
                        </Link>
                      )}
                      <Link
                        to={`/product/${item.id}`}
                        className="rounded-lg bg-[var(--tg-theme-bg-color,#efeff4)] px-2.5 py-1.5 text-[12px] font-semibold"
                      >
                        Details
                      </Link>
                    </div>
                  </div>
                </div>
              </SectionCard>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MyListings() {
  return (
    <RequireProfile>
      <MyListingsInner />
    </RequireProfile>
  );
}
