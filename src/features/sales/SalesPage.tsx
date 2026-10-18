import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  PageHeader,
  PeriodPicker,
  Section,
} from '../../components/ui';
import type { SaleSummary, SalesFilters } from '../../lib/api/types';
import { formatDate, formatTime } from '../../lib/format';
import { localToday, periodFromParam, periodToParam, resolvePeriod, SIMPLE_PERIODS } from '../../lib/period';
import { usePermissions, useShopSettings } from '../auth/hooks';
import { useSales } from './api';

export default function SalesPage() {
  const { t, i18n } = useTranslation();
  const { isOwner } = usePermissions();
  const settings = useShopSettings();
  const tz = settings?.timezone ?? 'Africa/Addis_Ababa';
  const [params, setParams] = useSearchParams();
  const period = periodFromParam(params.get('period'));
  const range = resolvePeriod(period, tz);

  // Staff are pinned server-side to their own sales today; the filters only matter for owners.
  const filters: SalesFilters = isOwner
    ? range
    : {};
  const sales = useSales(filters);
  const items = sales.data?.pages.flatMap((p) => p.items) ?? [];
  const first = sales.data?.pages[0];

  const groups = new Map<string, SaleSummary[]>();
  for (const s of items) {
    const day = localToday(tz, new Date(s.sold_at));
    groups.set(day, [...(groups.get(day) ?? []), s]);
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={isOwner ? t('nav.sales') : t('nav.mySales')}
        subtitle={isOwner ? undefined : t('sales.todayOnly')}
      />
      {isOwner ? (
        <PeriodPicker
            value={period}
            timeZone={tz}
            presets={SIMPLE_PERIODS}
            onChange={(p) =>
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('period', periodToParam(p));
                  return next;
                },
                { replace: true },
              )
            }
          />
      ) : null}

      {first ? (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs text-hint">{t('sales.count', { count: first.total_count })}</p>
            <Money value={first.total_amount} className="text-xl font-bold" />
          </div>
          <Receipt aria-hidden className="size-8 text-brand" />
        </Card>
      ) : null}

      {sales.isPending ? (
        <ListSkeleton rows={6} />
      ) : sales.isError ? (
        <ErrorState error={sales.error} onRetry={() => void sales.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Receipt} title={t('sales.emptyTitle')} description={isOwner ? t('sales.emptyOwner') : t('sales.emptyStaff')} />
      ) : (
        <>
          {[...groups.entries()].map(([day, list]) => (
            <Section key={day} title={formatDate(day, i18n.language)}>
              <ListGroup>
                {list.map((s) => (
                  <ListRow
                    key={s.id}
                    to={`/sales/${s.id}`}
                    title={`#${s.receipt_no} · ${t('sales.items', { count: s.item_count })}`}
                    subtitle={`${formatTime(s.sold_at, i18n.language, tz)} · ${t(`paymentMethod.${s.payment_method}`)}${isOwner ? ` · ${s.cashier_name}` : ''}`}
                    trailing={<Money value={s.total} className={s.status === 'voided' ? 'text-hint line-through' : undefined} />}
                    meta={
                      s.status === 'voided' ? (
                        <Badge tone="danger">{t('receipt.voided')}</Badge>
                      ) : s.has_returns ? (
                        <Badge tone="warning">{t('receipt.partlyReturned')}</Badge>
                      ) : isOwner && s.profit !== undefined ? (
                        <Money value={s.profit} tone="auto" className="text-xs" />
                      ) : undefined
                    }
                  />
                ))}
              </ListGroup>
            </Section>
          ))}
          {sales.hasNextPage ? (
            <Button block variant="secondary" loading={sales.isFetchingNextPage} onClick={() => void sales.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          ) : null}
        </>
      )}

    </div>
  );
}
