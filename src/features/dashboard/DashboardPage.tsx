import {
  AlertTriangle,
  Banknote,
  Boxes,
  HandCoins,
  PackageSearch,
  Receipt,
  ShoppingBag,
  SlidersHorizontal,
  TrendingUp,
  Undo2,
  Wallet,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BarList,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FilterGroup,
  FilterSheet,
  IconButton,
  ListGroup,
  ListRow,
  Money,
  Notice,
  PageHeader,
  PeriodPicker,
  Quantity,
  Section,
  Skeleton,
  StatCard,
  StatGridSkeleton,
  Tabs,
  TrendChart,
} from '../../components/ui';
import { PAYMENT_METHODS, type Kpis, type PaymentMethod, type ReportFilters } from '../../lib/api/types';
import { formatDate, formatEtb, formatNumber, formatRelative, percentChange } from '../../lib/format';
import { periodFromParam, periodToParam, resolvePeriod } from '../../lib/period';
import { useShopSettings } from '../auth/hooks';
import { useCategories, useLowStock } from '../products/api';
import {
  useCashierBreakdown,
  useCategoryBreakdown,
  useDashboardSummary,
  usePaymentBreakdown,
  useProductPerformance,
  useSalesTrend,
  useSlowMovers,
} from '../reports/api';

type Rank = 'qty' | 'revenue' | 'profit';

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const settings = useShopSettings();
  const tz = settings?.timezone ?? 'Africa/Addis_Ababa';
  const [params, setParams] = useSearchParams();
  const period = periodFromParam(params.get('period'));
  const range = resolvePeriod(period, tz);
  const [scope, setScope] = useState<{ categories: string[]; methods: PaymentMethod[] }>({ categories: [], methods: [] });
  const [draft, setDraft] = useState(scope);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [metric, setMetric] = useState<'revenue' | 'profit'>('revenue');
  const [rank, setRank] = useState<Rank>('revenue');
  const categories = useCategories();

  const filters: ReportFilters = {
    ...range,
    ...(scope.categories.length ? { category_ids: scope.categories } : {}),
    ...(scope.methods.length ? { payment_methods: scope.methods } : {}),
  };
  const summary = useDashboardSummary(filters);
  const trend = useSalesTrend(filters);
  const top = useProductPerformance(filters, rank, 8);
  const byCategory = useCategoryBreakdown(filters);
  const byPayment = usePaymentBreakdown(filters);
  const byCashier = useCashierBreakdown(filters);
  const slow = useSlowMovers(6);
  const low = useLowStock(6);
  const activeFilters = scope.categories.length + scope.methods.length;

  const setPeriod = (p: Parameters<typeof periodToParam>[0]) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set('period', periodToParam(p));
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-5">
      <PageHeader
        title={settings?.shop_name || t('nav.dashboard')}
        subtitle={t('nav.dashboard')}
        action={
          <IconButton
            icon={SlidersHorizontal}
            label={t('filters.title')}
            variant={activeFilters ? 'active' : 'surface'}
            onClick={() => {
              setDraft(scope);
              setFiltersOpen(true);
            }}
          />
        }
      />
      <PeriodPicker value={period} onChange={setPeriod} timeZone={tz} />
      {activeFilters ? (
        <div className="flex flex-wrap gap-1.5">
          {scope.categories.map((id) => (
            <Chip key={id} onRemove={() => setScope({ ...scope, categories: scope.categories.filter((c) => c !== id) })} removeLabel={t('filters.remove')}>
              {categories.data?.find((c) => c.id === id)?.name ?? '…'}
            </Chip>
          ))}
          {scope.methods.map((m) => (
            <Chip key={m} onRemove={() => setScope({ ...scope, methods: scope.methods.filter((x) => x !== m) })} removeLabel={t('filters.remove')}>
              {t(`paymentMethod.${m}`)}
            </Chip>
          ))}
        </div>
      ) : null}

      {summary.isPending ? (
        <StatGridSkeleton count={8} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <>
          {summary.data.stock.product_count === 0 ? <FirstRun /> : null}
          <KpiGrid current={summary.data.current} previous={summary.data.previous} />
          {summary.data.scoped ? <Notice>{t('dashboard.scopedNote')}</Notice> : null}

          <Section title={t('dashboard.stockTitle')}>
            <div className="grid grid-cols-2 gap-3">
              <StatCard icon={Boxes} label={t('dashboard.valueCost')} value={<Money value={summary.data.stock.value_cost} />} hint={t('dashboard.units', { qty: formatNumber(summary.data.stock.units) })} />
              <StatCard icon={Banknote} label={t('dashboard.valueRetail')} value={<Money value={summary.data.stock.value_retail} />} hint={t('dashboard.potential', { value: formatEtb(summary.data.stock.potential_profit) })} />
              <LinkTile to="/products?stock=low">
                <StatCard icon={AlertTriangle} label={t('dashboard.lowStock')} value={formatNumber(summary.data.stock.low_count)} hint={t('dashboard.outCount', { count: summary.data.stock.out_count })} />
              </LinkTile>
              <LinkTile to="/more/customers">
                <StatCard icon={HandCoins} label={t('dashboard.receivables')} value={<Money value={summary.data.receivables} />} hint={t('dashboard.receivablesHint')} />
              </LinkTile>
            </div>
          </Section>
        </>
      )}

      <Card>
        <div className="mb-3">
          <Tabs
            label={t('dashboard.trendMetric')}
            value={metric}
            onChange={setMetric}
            items={[
              { value: 'revenue', label: t('kpi.revenue') },
              { value: 'profit', label: t('kpi.grossProfit') },
            ]}
          />
        </div>
        {trend.isPending ? (
          <Skeleton className="h-40" />
        ) : trend.isError ? (
          <ErrorState error={trend.error} onRetry={() => void trend.refetch()} />
        ) : (
          <TrendChart
            title={t(`dashboard.trendTitle.${trend.data.bucket}`, { metric: t(metric === 'revenue' ? 'kpi.revenue' : 'kpi.grossProfit') })}
            formatValue={(n) => formatEtb(n)}
            data={trend.data.points.map((p) => ({
              key: p.bucket,
              label: formatDate(p.bucket, i18n.language).replace(/ \d{4}$/, ''),
              value: metric === 'revenue' ? p.revenue : p.profit,
              tooltip: `${formatDate(p.bucket, i18n.language)} · ${formatEtb(metric === 'revenue' ? p.revenue : p.profit)} · ${t('sales.count', { count: p.sales })}`,
            }))}
          />
        )}
      </Card>

      <Section title={t('dashboard.topProducts')}>
        <Tabs
          label={t('dashboard.rankBy')}
          value={rank}
          onChange={setRank}
          items={[
            { value: 'revenue', label: t('kpi.revenue') },
            { value: 'qty', label: t('dashboard.quantity') },
            { value: 'profit', label: t('kpi.grossProfit') },
          ]}
        />
        <Card>
          {top.isPending ? (
            <Skeleton className="h-32" />
          ) : top.isError ? (
            <ErrorState error={top.error} onRetry={() => void top.refetch()} />
          ) : top.data.length === 0 ? (
            <EmptyState icon={ShoppingBag} title={t('dashboard.noSales')} className="py-4" />
          ) : (
            <BarList
              data={top.data.map((p) => ({
                key: p.product_id,
                label: p.name,
                value: rank === 'qty' ? p.qty : rank === 'revenue' ? p.revenue : p.profit,
                display: rank === 'qty' ? `${formatNumber(p.qty)} ${t(`unitShort.${p.unit}`, { count: p.qty })}` : formatEtb(rank === 'revenue' ? p.revenue : p.profit),
                sub: t('dashboard.topSub', { revenue: formatEtb(p.revenue), profit: formatEtb(p.profit), margin: p.margin_pct ?? 0 }),
              }))}
            />
          )}
        </Card>
      </Section>

      <Breakdown
        title={t('dashboard.byCategory')}
        query={byCategory}
        rows={(d) => d.map((c) => ({ key: c.category_id ?? 'none', label: c.name ?? t('dashboard.uncategorized'), value: c.revenue, display: formatEtb(c.revenue), sub: t('dashboard.profitSub', { value: formatEtb(c.profit) }) }))}
      />
      <Breakdown
        title={t('dashboard.byPayment')}
        query={byPayment}
        rows={(d) => d.map((p) => ({ key: p.payment_method, label: t(`paymentMethod.${p.payment_method}`), value: p.revenue, display: formatEtb(p.revenue), sub: t('sales.count', { count: p.sales }) }))}
      />
      <Breakdown
        title={t('dashboard.byCashier')}
        query={byCashier}
        rows={(d) => d.map((c) => ({ key: c.cashier_id, label: c.name, value: c.revenue, display: formatEtb(c.revenue), sub: t('sales.count', { count: c.sales }) }))}
      />

      <Section title={t('dashboard.lowStockList')} action={<Link to="/products?stock=low" className="text-sm font-semibold text-brand">{t('dashboard.seeAll')}</Link>}>
        {low.isPending ? (
          <Skeleton className="h-24" />
        ) : low.isError ? (
          <ErrorState error={low.error} onRetry={() => void low.refetch()} />
        ) : low.data.length === 0 ? (
          <Card className="text-sm text-hint">{t('dashboard.allStocked')}</Card>
        ) : (
          <ListGroup>
            {low.data.map((p) => (
              <ListRow key={p.id} to={`/products/${p.id}`} title={p.name} subtitle={t('dashboard.reorderAt', { qty: formatNumber(p.reorder_level) })} trailing={<Quantity value={p.stock_qty} unit={p.unit} />} />
            ))}
          </ListGroup>
        )}
      </Section>

      <Section title={t('dashboard.slowMovers', { days: settings?.slow_mover_days ?? 30 })}>
        {slow.isPending ? (
          <Skeleton className="h-24" />
        ) : slow.isError ? (
          <ErrorState error={slow.error} onRetry={() => void slow.refetch()} />
        ) : slow.data.length === 0 ? (
          <Card className="text-sm text-hint">{t('dashboard.noSlowMovers')}</Card>
        ) : (
          <ListGroup>
            {slow.data.map((p) => (
              <ListRow
                key={p.product_id}
                to={`/products/${p.product_id}`}
                leading={<PackageSearch aria-hidden className="size-5 text-hint" />}
                title={p.name}
                subtitle={p.last_sold_at ? t('dashboard.lastSold', { when: formatRelative(p.last_sold_at, i18n.language) }) : t('dashboard.neverSold')}
                trailing={<Money value={p.stock_value_cost} />}
                meta={<Quantity value={p.stock_qty} unit={p.unit} className="text-xs text-hint" />}
              />
            ))}
          </ListGroup>
        )}
      </Section>

      <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)} onApply={() => setScope(draft)} onReset={() => setDraft({ categories: [], methods: [] })}>
        {categories.data && categories.data.length > 0 ? (
          <FilterGroup label={t('products.category')}>
            {categories.data.map((c) => (
              <Chip
                key={c.id}
                selected={draft.categories.includes(c.id)}
                onClick={() => setDraft({ ...draft, categories: draft.categories.includes(c.id) ? draft.categories.filter((x) => x !== c.id) : [...draft.categories, c.id] })}
              >
                {c.name}
              </Chip>
            ))}
          </FilterGroup>
        ) : null}
        <FilterGroup label={t('sell.payment')}>
          {PAYMENT_METHODS.map((m) => (
            <Chip key={m} selected={draft.methods.includes(m)} onClick={() => setDraft({ ...draft, methods: draft.methods.includes(m) ? draft.methods.filter((x) => x !== m) : [...draft.methods, m] })}>
              {t(`paymentMethod.${m}`)}
            </Chip>
          ))}
        </FilterGroup>
      </FilterSheet>
    </div>
  );
}

function KpiGrid({ current: c, previous: p }: { current: Kpis; previous: Kpis }) {
  const { t } = useTranslation();
  const d = (a: number, b: number) => percentChange(a, b);
  return (
    <div className="grid grid-cols-2 gap-3">
      <StatCard icon={Banknote} label={t('kpi.revenue')} value={<Money value={c.revenue} />} delta={d(c.revenue, p.revenue)} />
      <StatCard icon={TrendingUp} label={t('kpi.grossProfit')} value={<Money value={c.gross_profit} tone="auto" />} delta={d(c.gross_profit, p.gross_profit)} />
      <StatCard icon={Wallet} label={t('kpi.expenses')} value={<Money value={c.expenses} />} delta={d(c.expenses, p.expenses)} invert />
      <StatCard icon={HandCoins} label={t('kpi.netProfit')} value={<Money value={c.net_profit} tone="auto" />} delta={d(c.net_profit, p.net_profit)} />
      <StatCard icon={ShoppingBag} label={t('kpi.itemsSold')} value={formatNumber(c.items_sold)} delta={d(c.items_sold, p.items_sold)} />
      <StatCard icon={Receipt} label={t('kpi.sales')} value={formatNumber(c.sales_count)} hint={c.avg_sale !== null ? t('kpi.avgSale', { value: formatEtb(c.avg_sale) }) : undefined} />
      <StatCard label={t('kpi.margin')} value={c.margin_pct !== null ? `${c.margin_pct}%` : '—'} hint={t('kpi.cogs', { value: formatEtb(c.cogs) })} />
      <StatCard icon={Undo2} label={t('kpi.returnsLoss')} value={<Money value={c.returns_amount + c.stock_loss} />} hint={t('kpi.returnsLossHint', { returns: formatEtb(c.returns_amount), loss: formatEtb(c.stock_loss) })} />
    </div>
  );
}

function LinkTile({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="press block rounded-card">
      {children}
    </Link>
  );
}

function Breakdown<T>({
  title,
  query,
  rows,
}: {
  title: string;
  query: { isPending: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown };
  rows: (d: T) => Array<{ key: string; label: string; value: number; display: string; sub?: string }>;
}) {
  const { t } = useTranslation();
  const data = query.data ? rows(query.data) : [];
  return (
    <Section title={title}>
      <Card>
        {query.isPending ? (
          <Skeleton className="h-24" />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : data.length === 0 ? (
          <p className="text-sm text-hint">{t('dashboard.noSales')}</p>
        ) : (
          <BarList data={data} />
        )}
      </Card>
    </Section>
  );
}

function FirstRun() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Notice
      icon={Boxes}
      title={t('dashboard.firstRunTitle')}
      action={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/products/new')}>
            {t('products.add')}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => navigate('/more/import')}>
            {t('import.title')}
          </Button>
        </div>
      }
    >
      {t('dashboard.firstRunBody')}
    </Notice>
  );
}
