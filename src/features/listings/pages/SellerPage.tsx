import { Flag, PackageOpen, UserX } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import { Avatar, Button, Card, EmptyState, ErrorState, GridSkeleton, ListingCard, RatingDisplay, Section, Skeleton, VerifiedBadge } from '../../../components/ui';
import { toAppError } from '../../../lib/api/errors';
import { formatDate } from '../../../lib/format';
import { useSession } from '../../auth/session';
import { useSeller } from '../api';
import { ReportSheet } from '../components/ReportSheet';

export default function SellerPage() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const session = useSession();
  const seller = useSeller(id);
  const [reporting, setReporting] = useState(false);

  if (seller.isPending) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <GridSkeleton count={4} />
      </div>
    );
  }
  if (seller.isError) {
    return toAppError(seller.error).code === 'not_found' ? (
      <EmptyState icon={UserX} title={t('seller.notFound')} />
    ) : (
      <ErrorState error={seller.error} onRetry={() => void seller.refetch()} />
    );
  }
  const s = seller.data;
  return (
    <div className="space-y-6">
      <Card className="flex items-center gap-4">
        <Avatar name={s.name} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-lg font-bold">
            <span className="truncate">{s.name || t('seller.anonymous')}</span>
            {s.verified ? <VerifiedBadge /> : null}
          </h1>
          <RatingDisplay rating={s.rating.rating} count={s.rating.count} size="md" />
          <p className="mt-0.5 text-xs text-hint">
            {[s.city, t('seller.memberSince', { date: formatDate(s.member_since, i18n.language) }), t('seller.soldCount', { count: s.sold_count })]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </Card>

      <Section title={t('seller.listings', { count: s.listings.length })}>
        {s.listings.length === 0 ? (
          <EmptyState icon={PackageOpen} title={t('seller.noListings')} />
        ) : (
          <ul className="grid grid-cols-2 gap-3">
            {s.listings.map((it) => (
              <li key={it.id}>
                <ListingCard item={it} className="h-full" />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {s.reviews.length ? (
        <Section title={t('seller.reviews')}>
          <ul className="space-y-2">
            {s.reviews.map((r, i) => (
              <li key={i}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{r.reviewer_name || t('seller.anonymous')}</span>
                    <RatingDisplay rating={r.rating} count={1} />
                  </div>
                  {r.comment ? <p className="mt-1 text-sm">{r.comment}</p> : null}
                  <p className="mt-1 text-xs text-hint">{formatDate(r.created_at, i18n.language)}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {session.status === 'authenticated' ? (
        <Button variant="ghost" icon={Flag} onClick={() => setReporting(true)}>
          {t('report.seller')}
        </Button>
      ) : null}
      {reporting && id ? <ReportSheet open targetType="user" targetId={id} onClose={() => setReporting(false)} /> : null}
    </div>
  );
}
