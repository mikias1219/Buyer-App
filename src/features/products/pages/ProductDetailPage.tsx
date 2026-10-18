import { Archive, ArchiveRestore, ClipboardCheck, History, PackagePlus, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  Notice,
  PageSkeleton,
  Quantity,
  Section,
  StatCard,
  StockBadge,
  toast,
} from '../../../components/ui';
import type { Movement, Product } from '../../../lib/api/types';
import { formatDate, formatTime } from '../../../lib/format';
import { resolvePeriod } from '../../../lib/period';
import { showConfirm } from '../../../lib/telegram';
import { toAppError } from '../../../lib/api/errors';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { usePermissions, useShopSettings } from '../../auth/hooks';
import { useProductPerformance } from '../../reports/api';
import { useDeleteProduct, useMovements, useProduct, useSetProductStatus } from '../api';
import { AdjustSheet } from '../components/AdjustSheet';
import { ProductThumb } from '../components/ProductThumb';
import { RestockSheet } from '../components/RestockSheet';

export default function ProductDetailPage() {
  const { id = '' } = useParams();
  const product = useProduct(id);
  if (product.isPending) return <PageSkeleton />;
  if (product.isError) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  return <ProductView product={product.data} />;
}

function ProductView({ product: p }: { product: Product }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isOwner, canRestock } = usePermissions();
  const settings = useShopSettings();
  const errorMessage = useErrorMessage();
  const [sheet, setSheet] = useState<'restock' | 'adjust' | null>(null);
  const setStatus = useSetProductStatus();
  const del = useDeleteProduct();
  const last30 = resolvePeriod({ preset: 'last_30' }, settings?.timezone ?? 'Africa/Addis_Ababa');
  const perf = useProductPerformance({ ...last30, product_ids: [p.id] }, 'qty', 1, isOwner);
  const stats = perf.data?.[0];

  const remove = async () => {
    if (!(await showConfirm(t('productDetail.confirmDelete', { name: p.name })))) return;
    del.mutate(p.id, {
      onSuccess: () => {
        toast.success(t('productDetail.deleted'));
        navigate('/products', { replace: true });
      },
      onError: (e) => toast.error(toAppError(e).code === 'has_history' ? t('productDetail.hasHistory') : errorMessage(e)),
    });
  };
  const toggleArchive = async () => {
    const next = p.status === 'active' ? 'archived' : 'active';
    if (next === 'archived' && !(await showConfirm(t('productDetail.confirmArchive', { name: p.name })))) return;
    setStatus.mutate(
      { id: p.id, status: next },
      { onSuccess: () => toast.success(t(next === 'archived' ? 'productDetail.archivedToast' : 'productDetail.restoredToast')), onError: (e) => toast.error(errorMessage(e)) },
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        {p.image_path ? <ProductThumb path={p.image_path} size={64} /> : null}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold leading-tight">{p.name}</h1>
          {p.barcode ? <p className="tabular mt-0.5 text-sm text-hint">{p.barcode}</p> : null}
          <div className="mt-1.5">{p.status === 'archived' ? <span className="text-sm font-semibold text-hint">{t('products.archived')}</span> : <StockBadge status={p.stock_status} />}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label={t('productDetail.inStock')} value={<Quantity value={p.stock_qty} unit={p.unit} />} hint={t('productDetail.reorderAt', { qty: p.reorder_level })} />
        <StatCard label={t('productDetail.price')} value={<Money value={p.sell_price} />} />
        {isOwner && p.avg_cost !== undefined ? (
          <>
            <StatCard label={t('productDetail.avgCost')} value={<Money value={p.avg_cost} />} />
            <StatCard label={t('productDetail.profitEach')} value={<Money value={Math.round((p.sell_price - p.avg_cost) * 100) / 100} tone="auto" />} />
          </>
        ) : null}
      </div>

      {isOwner ? (
        <Card className="flex items-center justify-between gap-2 text-sm">
          <span className="text-hint">{t('productDetail.last30')}</span>
          <span className="text-right font-semibold">
            {t('dashboard.sold')} <Quantity value={stats?.qty ?? 0} unit={p.unit} /> · {t('productDetail.profit')} <Money value={stats?.profit ?? 0} tone="auto" />
          </span>
        </Card>
      ) : null}

      {p.notes ? <Notice>{p.notes}</Notice> : null}

      {canRestock && p.status === 'active' ? (
        <Button block size="lg" icon={PackagePlus} onClick={() => setSheet('restock')}>
          {t('stockOps.restock')}
        </Button>
      ) : null}
      {isOwner ? (
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/products/${p.id}/edit`)}>
            {t('common.edit')}
          </Button>
          <Button variant="secondary" icon={ClipboardCheck} onClick={() => setSheet('adjust')}>
            {t('stockOps.adjust')}
          </Button>
          <Button variant="ghost" icon={p.status === 'active' ? Archive : ArchiveRestore} loading={setStatus.isPending} onClick={() => void toggleArchive()}>
            {p.status === 'active' ? t('productDetail.archive') : t('productDetail.restore')}
          </Button>
          <Button variant="ghost" icon={Trash2} className="text-danger" loading={del.isPending} onClick={() => void remove()}>
            {t('productDetail.delete')}
          </Button>
        </div>
      ) : null}

      {isOwner ? <MovementHistory product={p} timeZone={settings?.timezone} /> : null}

      <RestockSheet key={`r-${p.updated_at}`} product={p} open={sheet === 'restock'} onClose={() => setSheet(null)} />
      {isOwner ? <AdjustSheet key={`a-${p.updated_at}`} product={p} open={sheet === 'adjust'} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function MovementHistory({ product, timeZone }: { product: Product; timeZone: string | undefined }) {
  const { t, i18n } = useTranslation();
  const moves = useMovements(product.id, true);
  const list: Movement[] = moves.data?.pages.flat() ?? [];
  return (
    <Section title={t('productDetail.history')}>
      {moves.isPending ? (
        <ListSkeleton rows={4} />
      ) : moves.isError ? (
        <ErrorState error={moves.error} onRetry={() => void moves.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={History} title={t('productDetail.noHistory')} className="py-6" />
      ) : (
        <>
          <ListGroup>
            {list.map((m) => (
              <ListRow
                key={m.id}
                {...(m.sale_id ? { to: `/sales/${m.sale_id}` } : {})}
                title={`${t(`movement.${m.type}`)}${m.receipt_no ? ` #${m.receipt_no}` : ''}`}
                subtitle={[`${formatDate(m.created_at, i18n.language)} ${formatTime(m.created_at, i18n.language, timeZone)}`, m.actor_name, m.supplier, m.reason].filter(Boolean).join(' · ')}
                trailing={
                  <span className={m.qty_delta > 0 ? 'text-success' : 'text-danger'}>
                    {m.qty_delta > 0 ? '+' : '−'}
                    <Quantity value={Math.abs(m.qty_delta)} unit={product.unit} />
                  </span>
                }
                meta={<span className="text-xs text-hint">{t('productDetail.after', { qty: m.stock_after })}</span>}
              />
            ))}
          </ListGroup>
          {moves.hasNextPage ? (
            <Button block variant="secondary" loading={moves.isFetchingNextPage} onClick={() => void moves.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          ) : null}
        </>
      )}
    </Section>
  );
}
