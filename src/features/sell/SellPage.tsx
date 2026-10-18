import { PackageX, Search, ShoppingCart } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, cn, EmptyState, ErrorState, Input, ListSkeleton, Money, PageHeader, Quantity, toast } from '../../components/ui';
import type { Product } from '../../lib/api/types';
import { haptic } from '../../lib/telegram';
import { useDebounced } from '../../lib/useDebounced';
import { useShopSettings } from '../auth/hooks';
import { useProducts } from '../products/api';
import { isWholeUnit } from '../products/logic';
import { CartSheet } from './components/CartSheet';
import { cartTotals } from './logic';
import { useCart } from './useCart';

export default function SellPage() {
  const { t } = useTranslation();
  const settings = useShopSettings();
  const [cart, dispatch] = useCart();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const query = useDebounced(q.trim());
  const products = useProducts({ ...(query ? { q: query } : {}), sort: 'best_selling' });
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const totals = cartTotals(cart.lines, cart.discount);
  const allowNegative = Boolean(settings?.allow_negative_stock);

  const add = (p: Product) => {
    const inCart = cart.lines.find((l) => l.product.id === p.id)?.qty ?? 0;
    const step = 1;
    if (!allowNegative && inCart + step > p.stock_qty) {
      if (isWholeUnit(p.unit) || p.stock_qty - inCart <= 0) {
        toast.error(t('sell.noMoreStock', { name: p.name }));
        haptic.notify('error');
        return;
      }
    }
    const qty = !allowNegative && inCart + step > p.stock_qty ? Math.round((p.stock_qty - inCart) * 1000) / 1000 : step;
    haptic.impact('light');
    dispatch({
      type: 'add',
      qty,
      product: {
        id: p.id,
        name: p.name,
        unit: p.unit,
        sell_price: p.sell_price,
        stock_qty: p.stock_qty,
        ...(p.avg_cost !== undefined ? { avg_cost: p.avg_cost } : {}),
      },
    });
  };

  return (
    <div className="space-y-3">
      <PageHeader title={t('nav.sell')} subtitle={settings?.shop_name || undefined} />
      <Input type="search" aria-label={t('sell.search')} placeholder={t('sell.search')} leading={<Search aria-hidden className="size-5" />} value={q} onChange={(e) => setQ(e.target.value)} />
      {products.isPending ? (
        <ListSkeleton rows={6} />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={PackageX} title={query ? t('products.noMatchTitle') : t('sell.noProductsTitle')} description={query ? t('products.noMatchBody') : t('sell.noProductsBody')} />
      ) : (
        <ul className={cn('grid grid-cols-2 gap-2', cart.lines.length > 0 && 'pb-16')}>
          {items.map((p) => {
            const inCart = cart.lines.find((l) => l.product.id === p.id)?.qty ?? 0;
            const out = p.stock_qty <= 0 && !allowNegative;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={out}
                  onClick={() => add(p)}
                  className={cn(
                    'press relative flex h-full min-h-24 w-full flex-col justify-between rounded-card bg-surface p-3 text-left shadow-card disabled:opacity-45',
                    inCart > 0 && 'ring-2 ring-brand',
                  )}
                >
                  <span className="line-clamp-2 text-sm font-semibold leading-snug">{p.name}</span>
                  <span className="mt-2 flex items-end justify-between gap-1">
                    <Money value={p.sell_price} className="text-sm font-bold" />
                    <span className={cn('text-xs', p.stock_status === 'ok' ? 'text-hint' : 'font-semibold text-warning', out && 'text-danger')}>
                      <Quantity value={p.stock_qty} unit={p.unit} />
                    </span>
                  </span>
                  {inCart > 0 ? (
                    <span className="tabular absolute right-2 top-2 rounded-full bg-brand px-2 text-xs font-bold text-brand-contrast">{inCart}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {products.hasNextPage ? (
        <Button block variant="secondary" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
          {t('common.loadMore')}
        </Button>
      ) : null}

      {cart.lines.length > 0 ? (
        <div className="fixed inset-x-0 z-30 px-4" style={{ bottom: 'calc(72px + var(--safe-bottom))' }}>
          <Button block size="lg" icon={ShoppingCart} className="mx-auto max-w-lg justify-between shadow-sheet" onClick={() => setOpen(true)}>
            <span>{t('sell.reviewCart', { count: cart.lines.length })}</span>
            <Money value={totals.total} />
          </Button>
        </div>
      ) : null}
      <CartSheet open={open} onClose={() => setOpen(false)} cart={cart} dispatch={dispatch} />
    </div>
  );
}
