import { Receipt, Search, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  FilterGroup,
  FilterSheet,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  PageHeader,
  PeriodPicker,
  Section,
} from '../../components/ui';
import { PAYMENT_METHODS, type PaymentMethod, type SaleStatus, type SaleSummary, type SalesFilters } from '../../lib/api/types';
import { formatDate, formatTime } from '../../lib/format';
import { localToday, periodFromParam, periodToParam, resolvePeriod } from '../../lib/period';
import { useDebounced } from '../../lib/useDebounced';
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
  const [q, setQ] = useState('');
  const receipt = useDebounced(q.replace(/\D/g, ''));
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [status, setStatus] = useState<SaleStatus | 'all'>('all');
  const [draft, setDraft] = useState<{ methods: PaymentMethod[]; status: SaleStatus | 'all' }>({ methods: [], status: 'all' });
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Staff are pinned server-side to their own sales today; the filters only matter for owners.
  const filters: SalesFilters = isOwner
    ? { ...range, ...(methods.length ? { payment_methods: methods } : {}), status, ...(receipt ? { q: receipt } : {}) }
    : {};
  const sales = useSales(filters);
  const items = sales.data?.pages.flatMap((p) => p.items) ?? [];
  const first = sales.data?.pages[0];
  const activeFilters = methods.length + (status !== 'all' ? 1 : 0);

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
        action={isOwner ? <IconButton icon={SlidersHorizontal} label={t('filters.title')} variant={activeFilters ? 'active' : 'surface'} onClick={() => {
          setDraft({ methods, status });
          setFiltersOpen(true);
        }} /> : null}
      />
      {isOwner ? (
        <>
          <PeriodPicker
            value={period}
            timeZone={tz}
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
          <Input type="search" inputMode="numeric" aria-label={t('sales.searchReceipt')} placeholder={t('sales.searchReceipt')} leading={<Search aria-hidden className="size-5" />} value={q} onChange={(e) => setQ(e.target.value)} />
        </>
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

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        onApply={() => {
          setMethods(draft.methods);
          setStatus(draft.status);
        }}
        onReset={() => setDraft({ methods: [], status: 'all' })}
      >
        <FilterGroup label={t('sell.payment')}>
          {PAYMENT_METHODS.map((m) => (
            <Chip
              key={m}
              selected={draft.methods.includes(m)}
              onClick={() => setDraft({ ...draft, methods: draft.methods.includes(m) ? draft.methods.filter((x) => x !== m) : [...draft.methods, m] })}
            >
              {t(`paymentMethod.${m}`)}
            </Chip>
          ))}
        </FilterGroup>
        <FilterGroup label={t('sales.status')}>
          {(['all', 'completed', 'voided'] as const).map((s) => (
            <Chip key={s} selected={draft.status === s} onClick={() => setDraft({ ...draft, status: s })}>
              {t(`sales.statusOption.${s}`)}
            </Chip>
          ))}
        </FilterGroup>
      </FilterSheet>
    </div>
  );
}
