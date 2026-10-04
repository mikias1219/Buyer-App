import { Eye, Heart, MessageCircle, Plus, Store } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  ListingRow,
  ListingRowSkeleton,
  ListingStatusBadge,
  Notice,
  PageHeader,
  Tabs,
} from '../../../components/ui';
import type { MyListing } from '../../../lib/api/types';
import { formatDate } from '../../../lib/format';
import { useMe, useSettings } from '../../auth/hooks';
import { useMyListings } from '../../sell/api';
import { MINE_TABS, ownerActions, tabForStatus, type MineTab } from '../logic';
import { ACTION_ICONS, useOwnerActions } from '../useOwnerActions';

export default function MyListingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const me = useMe();
  const settings = useSettings();
  const listings = useMyListings();

  const grouped = useMemo(() => {
    const g = Object.fromEntries(MINE_TABS.map((tab) => [tab, [] as MyListing[]])) as Record<MineTab, MyListing[]>;
    for (const l of listings.data ?? []) g[tabForStatus(l.status)].push(l);
    return g;
  }, [listings.data]);

  const requested = params.get('tab') as MineTab | null;
  const firstNonEmpty = MINE_TABS.find((tab) => grouped[tab].length > 0) ?? 'live';
  const tab: MineTab = requested && MINE_TABS.includes(requested) ? requested : grouped.action.length ? 'action' : firstNonEmpty;

  const free = me.data?.free_listings_left ?? 0;

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('mine.title')}
        action={
          <Button size="sm" icon={Plus} onClick={() => navigate('/sell')}>
            {t('mine.new')}
          </Button>
        }
      />
      {me.data && settings.data ? (
        <p className="text-sm text-hint">
          {free > 0
            ? t('mine.freeLeft', { count: free })
            : t('mine.feeInfo', { fee: settings.data.listing_fee_etb.toLocaleString('en-US') })}
        </p>
      ) : null}

      {listings.isPending ? (
        <div className="space-y-2.5">
          <ListingRowSkeleton />
          <ListingRowSkeleton />
          <ListingRowSkeleton />
        </div>
      ) : listings.isError ? (
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      ) : listings.data.length === 0 ? (
        <EmptyState
          icon={Store}
          title={t('mine.emptyTitle')}
          description={t('mine.emptyBody')}
          action={
            <Button block icon={Plus} onClick={() => navigate('/sell')}>
              {t('mine.sellFirst')}
            </Button>
          }
        />
      ) : (
        <>
          <Tabs
            label={t('mine.tabsLabel')}
            value={tab}
            onChange={(v) => setParams({ tab: v }, { replace: true })}
            items={MINE_TABS.map((v) => ({ value: v, label: t(`mine.tab.${v}`), count: grouped[v].length, attention: v === 'action' }))}
          />
          {tab === 'action' && grouped.action.length ? (
            <Notice tone="warning" title={t('mine.actionNoticeTitle')}>
              {t('mine.actionNoticeBody')}
            </Notice>
          ) : null}
          {grouped[tab].length === 0 ? (
            <EmptyState icon={Store} title={t(`mine.empty.${tab}`)} />
          ) : (
            <ul className="space-y-2.5">
              {grouped[tab].map((l) => (
                <li key={l.id}>
                  <MineRow listing={l} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function MineRow({ listing: l }: { listing: MyListing }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { run, busy } = useOwnerActions();
  const actions = ownerActions(l);
  const primary = actions[0];
  const secondary = actions.slice(1, 3);
  return (
    <ListingRow
      title={l.title || t('mine.untitled')}
      price={l.price}
      coverPath={l.cover_path}
      onClick={() => (l.status === 'draft' ? navigate(`/sell/${l.id}`) : navigate(`/p/${l.id}`))}
      badge={<ListingStatusBadge status={l.status} />}
      meta={
        <div className="space-y-1">
          {l.status === 'active' || l.status === 'paused' || l.status === 'sold' ? (
            <span className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1">
                <Eye aria-hidden className="size-3.5" /> {l.views}
              </span>
              <span className="inline-flex items-center gap-1">
                <Heart aria-hidden className="size-3.5" /> {l.favorites_count}
              </span>
              <span className="inline-flex items-center gap-1">
                <MessageCircle aria-hidden className="size-3.5" /> {l.leads_count}
              </span>
              {l.is_featured ? <Badge tone="accent">{t('listing.featured')}</Badge> : null}
            </span>
          ) : null}
          {l.status === 'active' && l.expires_at ? (
            <span className="block">{t('owner.expiresOn', { date: formatDate(l.expires_at, i18n.language) })}</span>
          ) : null}
          {l.reject_reason ? <span className="block font-medium text-danger">{t(`rejectReason.${l.reject_reason}`)}</span> : null}
          {l.status === 'payment_submitted' ? <span className="block">{t('mine.waitingPayment')}</span> : null}
          {l.status === 'in_review' ? <span className="block">{t('mine.waitingReview')}</span> : null}
        </div>
      }
    >
      {primary ? (
        <div className="flex gap-2">
          <Button size="sm" icon={ACTION_ICONS[primary]} disabled={busy} onClick={() => run(primary, l)} className="flex-1">
            {t(`owner.action.${primary}`)}
          </Button>
          {secondary.map((a) => (
            <Button key={a} size="sm" variant={a === 'delete' ? 'ghost' : 'secondary'} icon={ACTION_ICONS[a]} disabled={busy} onClick={() => run(a, l)} aria-label={t(`owner.action.${a}`)}>
              <span className="sr-only sm:not-sr-only">{t(`owner.action.${a}`)}</span>
            </Button>
          ))}
        </div>
      ) : l.status === 'sold' ? (
        <Link to={`/p/${l.id}`} className="text-sm font-semibold text-brand">
          {t('mine.viewListing')}
        </Link>
      ) : null}
    </ListingRow>
  );
}
