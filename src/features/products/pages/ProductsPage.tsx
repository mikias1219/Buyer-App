import { PackagePlus, Plus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  PageHeader,
  Quantity,
  StockBadge,
  Tabs,
} from '../../../components/ui';
import type { ProductFilters, StockStatus } from '../../../lib/api/types';
import { useDebounced } from '../../../lib/useDebounced';
import { usePermissions } from '../../auth/hooks';
import { useProducts } from '../api';
import { ProductThumb } from '../components/ProductThumb';

type StockTab = 'all' | 'low' | 'out' | 'archived';

export default function ProductsPage() {
  const { t } = useTranslation();
  const { isOwner } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim());
  const tab = (['all', 'low', 'out', 'archived'].includes(params.get('stock') ?? '') ? params.get('stock') : 'all') as StockTab;

  const setParam = (key: string, value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const filters: ProductFilters = {
    ...(query ? { q: query } : {}),
    ...(tab === 'low' || tab === 'out' ? { stock: tab as StockStatus } : {}),
    ...(tab === 'archived' ? { status: 'archived' as const } : {}),
    sort: 'name',
  };
  const products = useProducts(filters);
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const total = products.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(query || tab !== 'all');

  const tabs = [
    { value: 'all' as const, label: t('products.tab.all') },
    { value: 'low' as const, label: t('stock.low') },
    { value: 'out' as const, label: t('stock.out') },
    ...(isOwner ? [{ value: 'archived' as const, label: t('products.tab.archived') }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.products')}
        subtitle={products.data ? t('products.count', { count: total }) : undefined}
        action={
          isOwner ? (
            <Button size="sm" icon={Plus} onClick={() => navigate('/products/new')}>
              {t('products.addShort')}
            </Button>
          ) : null
        }
      />

      <Input
        type="search"
        aria-label={t('products.search')}
        placeholder={t('products.search')}
        leading={<Search aria-hidden className="size-5" />}
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <Tabs items={tabs} value={tab} onChange={(v) => setParam('stock', v === 'all' ? null : v)} label={t('products.stockFilter')} />

      {products.isPending ? (
        <ListSkeleton rows={8} />
      ) : products.isError ? (
        <ErrorState error={products.error} onRetry={() => void products.refetch()} />
      ) : items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Search}
            title={t('products.noMatchTitle')}
            description={t('products.noMatchBody')}
            action={
              <Button
                variant="secondary"
                block
                onClick={() => {
                  setQ('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                {t('filters.reset')}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={PackagePlus}
            title={t('products.emptyTitle')}
            description={isOwner ? t('products.emptyOwner') : t('products.emptyStaff')}
            action={
              isOwner ? (
                <div className="space-y-2">
                  <Button block icon={Plus} onClick={() => navigate('/products/new')}>
                    {t('products.add')}
                  </Button>
                  <Button block variant="secondary" icon={Upload} onClick={() => navigate('/more/import')}>
                    {t('import.title')}
                  </Button>
                </div>
              ) : undefined
            }
          />
        )
      ) : (
        <>
          <ListGroup>
            {items.map((p) => (
              <ListRow
                key={p.id}
                to={`/products/${p.id}`}
                {...(p.image_path ? { leading: <ProductThumb path={p.image_path} /> } : {})}
                title={p.name}
                subtitle={
                  <>
                    {t('products.left')} <Quantity value={p.stock_qty} unit={p.unit} />
                  </>
                }
                trailing={<Money value={p.sell_price} />}
                meta={p.status === 'archived' ? <span className="text-xs text-hint">{t('products.archived')}</span> : <StockBadge status={p.stock_status} />}
              />
            ))}
          </ListGroup>
          {products.hasNextPage ? (
            <Button block variant="secondary" loading={products.isFetchingNextPage} onClick={() => void products.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
