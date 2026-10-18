import { FolderTree, PackagePlus, Plus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  PageHeader,
  Quantity,
  Select,
  StockBadge,
  Tabs,
} from '../../../components/ui';
import { PRODUCT_SORTS, type ProductFilters, type ProductSort, type StockStatus } from '../../../lib/api/types';
import { useDebounced } from '../../../lib/useDebounced';
import { usePermissions } from '../../auth/hooks';
import { useCategories, useProducts } from '../api';
import { ProductThumb } from '../components/ProductThumb';

type StockTab = 'all' | 'low' | 'out' | 'archived';

export default function ProductsPage() {
  const { t } = useTranslation();
  const { isOwner, canSeeCost } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = useDebounced(q.trim());
  const tab = (['all', 'low', 'out', 'archived'].includes(params.get('stock') ?? '') ? params.get('stock') : 'all') as StockTab;
  const categoryId = params.get('category') ?? '';
  const sort = (PRODUCT_SORTS.includes(params.get('sort') as ProductSort) ? params.get('sort') : 'name') as ProductSort;
  const categories = useCategories();

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
    ...(categoryId ? { category_id: categoryId } : {}),
    ...(tab === 'low' || tab === 'out' ? { stock: tab as StockStatus } : {}),
    ...(tab === 'archived' ? { status: 'archived' as const } : {}),
    sort,
  };
  const products = useProducts(filters);
  const items = products.data?.pages.flatMap((p) => p.items) ?? [];
  const total = products.data?.pages[0]?.total ?? 0;
  const filtered = Boolean(query || categoryId || tab !== 'all');

  const sortOptions = PRODUCT_SORTS.filter((s) => canSeeCost || s !== 'margin').map((s) => ({ value: s, label: t(`products.sort.${s}`) }));
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
            <div className="flex gap-1">
              <IconButton icon={FolderTree} label={t('categories.title')} variant="surface" onClick={() => navigate('/more/categories')} />
              <IconButton icon={Plus} label={t('products.add')} variant="active" onClick={() => navigate('/products/new')} />
            </div>
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

      {categories.data && categories.data.length > 0 ? (
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="radiogroup" aria-label={t('products.category')}>
          <Chip role="radio" aria-checked={!categoryId} selected={!categoryId} onClick={() => setParam('category', null)}>
            {t('products.allCategories')}
          </Chip>
          {categories.data.map((c) => (
            <Chip key={c.id} role="radio" aria-checked={categoryId === c.id} selected={categoryId === c.id} onClick={() => setParam('category', c.id)}>
              {c.name}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <Tabs items={tabs} value={tab} onChange={(v) => setParam('stock', v === 'all' ? null : v)} label={t('products.stockFilter')} className="flex-1" />
      </div>
      <Select aria-label={t('products.sortLabel')} options={sortOptions} value={sort} onChange={(e) => setParam('sort', e.target.value === 'name' ? null : e.target.value)} />

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
                leading={<ProductThumb path={p.image_path} />}
                title={p.name}
                subtitle={
                  <>
                    <Quantity value={p.stock_qty} unit={p.unit} />
                    {p.category_name ? ` · ${p.category_name}` : ''}
                    {canSeeCost && p.margin_pct !== undefined && p.margin_pct !== null ? ` · ${t('products.marginShort', { value: p.margin_pct })}` : ''}
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
