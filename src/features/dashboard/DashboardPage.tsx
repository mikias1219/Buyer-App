import { AlertTriangle, Boxes, HandCoins, ShoppingBag } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
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
} from '../../components/ui';
import type { DashboardSummary } from '../../lib/api/types';
import { formatNumber } from '../../lib/format';
import { periodFromParam, periodToParam, resolvePeriod, SIMPLE_PERIODS, type Period } from '../../lib/period';
import { useShopSettings } from '../auth/hooks';
import { useLowStock } from '../products/api';
import { useDashboardSummary, useProductPerformance } from '../reports/api';

/** Owner home: plain answers to "how much did I sell, what did I earn, what is running out". */
export default function DashboardPage() {
  const { t } = useTranslation();
  const settings = useShopSettings();
  const tz = settings?.timezone ?? 'Africa/Addis_Ababa';
  const [params, setParams] = useSearchParams();
  const period = periodFromParam(params.get('period'));
  const range = resolvePeriod(period, tz);
  const summary = useDashboardSummary(range);
  const top = useProductPerformance(range, 'qty', 5);
  const low = useLowStock(5);

  const setPeriod = (p: Period) =>
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
      <PageHeader title={settings?.shop_name || t('nav.dashboard')} subtitle={t('dashboard.subtitle')} />
      <PeriodPicker value={period} onChange={setPeriod} timeZone={tz} presets={SIMPLE_PERIODS} custom={false} />

      {summary.isPending ? (
        <StatGridSkeleton count={4} />
      ) : summary.isError ? (
        <ErrorState error={summary.error} onRetry={() => void summary.refetch()} />
      ) : (
        <Overview data={summary.data} />
      )}

      <Section title={t('dashboard.bestSellers')}>
        {top.isPending ? (
          <Skeleton className="h-32" />
        ) : top.isError ? (
          <ErrorState error={top.error} onRetry={() => void top.refetch()} />
        ) : top.data.length === 0 ? (
          <Card>
            <EmptyState icon={ShoppingBag} title={t('dashboard.noSales')} className="py-4" />
          </Card>
        ) : (
          <ListGroup>
            {top.data.map((p, i) => (
              <ListRow
                key={p.product_id}
                to={`/products/${p.product_id}`}
                leading={<span className="tabular flex size-8 items-center justify-center rounded-full bg-brand-soft text-sm font-bold text-brand">{i + 1}</span>}
                title={p.name}
                subtitle={
                  <>
                    {t('dashboard.sold')} <Quantity value={p.qty} unit={p.unit} />
                  </>
                }
                trailing={<Money value={p.revenue} />}
              />
            ))}
          </ListGroup>
        )}
      </Section>

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
              <ListRow
                key={p.id}
                to={`/products/${p.id}`}
                title={p.name}
                subtitle={p.stock_qty <= 0 ? t('stock.out') : t('dashboard.onlyLeft')}
                trailing={<Quantity value={p.stock_qty} unit={p.unit} className={p.stock_qty <= 0 ? 'font-semibold text-danger' : 'font-semibold text-warning'} />}
              />
            ))}
          </ListGroup>
        )}
      </Section>
    </div>
  );
}

function Overview({ data }: { data: DashboardSummary }) {
  const { t } = useTranslation();
  const c = data.current;
  return (
    <>
      {data.stock.product_count === 0 ? <FirstRun /> : null}

      <Card className="space-y-1">
        <p className="text-sm text-hint">{t('dashboard.salesMoney')}</p>
        <Money value={c.revenue} className="block text-3xl font-bold" />
        <p className="text-sm text-hint">
          {t('dashboard.salesCount', { count: c.sales_count })} · {t('dashboard.itemsCount', { qty: formatNumber(c.items_sold) })}
        </p>
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="text-sm text-hint">{t('dashboard.yourProfit')}</p>
          <Money value={c.net_profit} tone="auto" className="block text-3xl font-bold" />
        </div>
        <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
          <Line label={t('dashboard.profitFromGoods')} value={<Money value={c.gross_profit} tone="auto" />} />
          <Line label={t('dashboard.minusExpenses')} value={<Money value={c.expenses} />} to="/more/expenses" />
          {c.stock_loss > 0 ? <Line label={t('dashboard.minusLoss')} value={<Money value={c.stock_loss} />} /> : null}
        </dl>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Link to="/products?stock=low" className="press block rounded-card">
          <StatCard
            icon={AlertTriangle}
            label={t('dashboard.lowStock')}
            value={formatNumber(data.stock.low_count)}
            hint={t('dashboard.outCount', { count: data.stock.out_count })}
          />
        </Link>
        <Link to="/products" className="press block rounded-card">
          <StatCard icon={Boxes} label={t('dashboard.stockWorth')} value={<Money value={data.stock.value_cost} />} hint={t('dashboard.stockWorthHint')} />
        </Link>
        {data.receivables > 0 ? (
          <Link to="/more/customers" className="press col-span-2 block rounded-card">
            <StatCard icon={HandCoins} label={t('dashboard.receivables')} value={<Money value={data.receivables} />} hint={t('dashboard.receivablesHint')} />
          </Link>
        ) : null}
      </div>
    </>
  );
}

function Line({ label, value, to }: { label: string; value: ReactNode; to?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-hint">{to ? <Link to={to} className="underline decoration-line underline-offset-2">{label}</Link> : label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
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
