import { Package, Search, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button, EmptyState, ErrorState, Input, ListingRow, ListingRowSkeleton, ListingStatusBadge, Tabs, toast } from '../../../components/ui';
import { LISTING_REJECT_REASONS, type AdminListing } from '../../../lib/api/types';
import { formatRelative } from '../../../lib/format';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useAdminListings, useRemoveListing } from '../api';
import { ReasonSheet } from '../components/ReasonSheet';

const STATUSES = ['active', 'in_review', 'payment_submitted', 'pending_payment', 'paused', 'expired', 'rejected', 'removed', 'sold', 'all'] as const;

export default function ListingsPage() {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('active');
  const [search, setSearch] = useState('');
  const [removing, setRemoving] = useState<AdminListing | null>(null);
  const listings = useAdminListings(status, search.trim());
  const remove = useRemoveListing();
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('admin.listings.title')}</h1>
      <Tabs label={t('admin.listings.title')} value={status} onChange={setStatus} items={STATUSES.map((s) => ({ value: s, label: s === 'all' ? t('admin.reports.all') : t(`status.${s}`) }))} />
      <Input leading={<Search aria-hidden className="size-5" />} placeholder={t('admin.listings.search')} aria-label={t('admin.listings.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      {listings.isPending ? (
        <ListingRowSkeleton />
      ) : listings.isError ? (
        <ErrorState error={listings.error} onRetry={() => void listings.refetch()} />
      ) : listings.data.length === 0 ? (
        <EmptyState icon={Package} title={t('admin.listings.empty')} />
      ) : (
        <ul className="space-y-2.5">
          {listings.data.map((l) => (
            <li key={l.id}>
              <ListingRow
                title={l.title}
                price={l.price}
                coverPath={l.cover_path}
                badge={<ListingStatusBadge status={l.status} />}
                meta={
                  <span>
                    {l.seller.name}
                    {l.seller.username ? ` @${l.seller.username}` : ''} · {formatRelative(l.updated_at, i18n.language)} · {l.views} {t('owner.views')}
                  </span>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  {l.flags.map((f) => (
                    <Badge key={f} tone="danger">
                      {t(`flag.${f}`)}
                    </Badge>
                  ))}
                  <Link to={`/p/${l.id}`} className="text-sm font-semibold text-brand">
                    {t('admin.viewListing')}
                  </Link>
                  {!['draft', 'sold', 'removed'].includes(l.status) ? (
                    <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto text-danger" onClick={() => setRemoving(l)}>
                      {t('admin.listings.remove')}
                    </Button>
                  ) : null}
                </div>
              </ListingRow>
            </li>
          ))}
        </ul>
      )}
      {removing ? (
        <ReasonSheet
          open
          title={t('admin.listings.removeTitle', { title: removing.title })}
          reasons={LISTING_REJECT_REASONS}
          confirmLabel={t('admin.listings.remove')}
          loading={remove.isPending}
          onClose={() => setRemoving(null)}
          onConfirm={(reason, note) =>
            remove.mutate(
              { id: removing.id, reason, note },
              { onSuccess: () => { toast.success(t('admin.listings.removed')); setRemoving(null); }, onError: (e) => toast.error(errorMessage(e)) },
            )
          }
        />
      ) : null}
    </div>
  );
}
