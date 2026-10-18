import { HandCoins, Search, UserPlus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  PageHeader,
  Tabs,
} from '../../components/ui';
import { useDebounced } from '../../lib/useDebounced';
import { useCustomers } from './api';
import { CustomerSheet } from './CustomerSheet';

export default function CustomersPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'owing' | 'all'>('owing');
  const [adding, setAdding] = useState(false);
  const query = useDebounced(q.trim());
  const customers = useCustomers(query, tab === 'owing');
  const first = customers.data?.pages[0];
  const items = customers.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="space-y-4">
      <PageHeader title={t('customers.title')} subtitle={t('customers.subtitle')} action={<IconButton icon={UserPlus} label={t('customers.add')} variant="active" onClick={() => setAdding(true)} />} />
      {first && tab === 'owing' ? (
        <Card className="flex items-center justify-between">
          <div>
            <p className="text-xs text-hint">{t('customers.totalOwed', { count: first.total })}</p>
            <Money value={first.total_owed} className="text-2xl font-bold" />
          </div>
          <HandCoins aria-hidden className="size-8 text-warning" />
        </Card>
      ) : null}
      <Tabs
        label={t('customers.title')}
        value={tab}
        onChange={setTab}
        items={[
          { value: 'owing', label: t('customers.owing') },
          { value: 'all', label: t('customers.all') },
        ]}
      />
      <Input type="search" aria-label={t('customers.search')} placeholder={t('customers.search')} leading={<Search aria-hidden className="size-5" />} value={q} onChange={(e) => setQ(e.target.value)} />
      {customers.isPending ? (
        <ListSkeleton rows={5} />
      ) : customers.isError ? (
        <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={UsersRound}
          title={tab === 'owing' ? t('customers.nobodyOwes') : t('customers.emptyTitle')}
          description={t('customers.emptyBody')}
          action={
            <Button block icon={UserPlus} onClick={() => setAdding(true)}>
              {t('customers.add')}
            </Button>
          }
        />
      ) : (
        <>
          <ListGroup>
            {items.map((c) => (
              <ListRow
                key={c.id}
                to={`/more/customers/${c.id}`}
                title={c.name}
                subtitle={c.phone || undefined}
                trailing={c.balance !== 0 ? <Money value={c.balance} className={c.balance > 0 ? 'text-warning' : 'text-success'} /> : undefined}
                meta={c.balance > 0 ? <span className="text-xs text-hint">{t('customers.owes')}</span> : c.balance < 0 ? <span className="text-xs text-hint">{t('customers.credit')}</span> : undefined}
              />
            ))}
          </ListGroup>
          {customers.hasNextPage ? (
            <Button block variant="secondary" loading={customers.isFetchingNextPage} onClick={() => void customers.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          ) : null}
        </>
      )}
      {adding ? <CustomerSheet customer={null} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
