import { PackageOpen, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Section, Skeleton, cn } from '../../../components/ui';
import { CATEGORIES } from '../../../lib/api/types';
import { useMe } from '../../auth/hooks';
import { useHomeFeed } from '../api';
import { CATEGORY_ICONS } from '../categories';
import { ListingRail } from '../components/ListingRail';
import { SearchBar } from '../components/SearchBar';

export default function HomePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const me = useMe();
  const city = me.data?.city || null;
  const feed = useHomeFeed(city);
  const [q, setQ] = useState('');
  const data = feed.data;
  const empty = data && data.newest.length === 0;

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t('home.title')}</h1>
          <p className="text-sm text-hint">{t('home.subtitle')}</p>
        </div>
        <SearchBar value={q} onChange={setQ} onSubmit={() => navigate(`/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)} onFilters={() => navigate('/search?filters=1')} />
      </header>

      <Section title={t('home.categories')}>
        <ul className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICONS[c];
            const count = data?.category_counts[c] ?? 0;
            return (
              <li key={c}>
                <Link
                  to={`/search?category=${c}`}
                  className="press flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-card bg-surface p-2 text-center shadow-card"
                >
                  <Icon aria-hidden className="size-6 text-brand" />
                  <span className="line-clamp-1 text-xs font-semibold">{t(`category.${c}`)}</span>
                  {feed.isPending ? (
                    <Skeleton className="h-3 w-6" />
                  ) : (
                    <span className={cn('tabular text-[11px]', count ? 'text-hint' : 'text-hint/60')}>{count}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>

      {feed.isError ? (
        <ErrorState error={feed.error} onRetry={() => void feed.refetch()} />
      ) : empty ? (
        <EmptyState
          icon={PackageOpen}
          title={t('home.emptyTitle')}
          description={t('home.emptyBody')}
          action={
            <Button block icon={Plus} onClick={() => navigate('/sell')}>
              {t('home.sellFirst')}
            </Button>
          }
        />
      ) : (
        <>
          <ListingRail title={t('home.featured')} items={data?.featured} loading={feed.isPending} moreTo="/search?featured=1" />
          <ListingRail title={t('home.newest')} items={data?.newest} loading={feed.isPending} moreTo="/search" />
          {city ? (
            <ListingRail title={t('home.nearYou', { city })} items={data?.near_you} loading={feed.isPending} moreTo={`/search?city=${encodeURIComponent(city)}`} />
          ) : null}
          <ListingRail title={t('home.under20k')} items={data?.under_20k} loading={feed.isPending} moreTo="/search?max=20000&sort=price_asc" />
        </>
      )}
    </div>
  );
}
