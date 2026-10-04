import { AlertTriangle, BadgeCheck, Check, ClipboardCheck, Flag, SkipForward, Star, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, ImageGallery, Notice, PriceTag, Skeleton, toast } from '../../../components/ui';
import { imageUrl } from '../../../lib/api/client';
import { LISTING_REJECT_REASONS, type ListingRejectReason, type QueueItem } from '../../../lib/api/types';
import { formatDate, formatEtb } from '../../../lib/format';
import { haptic } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { CATEGORY_FIELDS } from '../../sell/categoryFields';
import { useModerate, useReviewQueue } from '../api';
import { ReasonSheet } from '../components/ReasonSheet';
import { SlaBadge } from '../components/SlaBadge';

const UNDO_MS = 5000;

type Pending = { item: QueueItem; approve: boolean; reason?: ListingRejectReason; note?: string };

/** Card-by-card review. Decisions are sent after a 5 s undo window. */
export default function QueuePage() {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const queue = useReviewQueue();
  const moderate = useModerate();
  const [skipped, setSkipped] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const commit = (p: Pending) => {
    moderate.mutate(
      { id: p.item.id, approve: p.approve, ...(p.reason ? { reason: p.reason } : {}), note: p.note ?? '' },
      {
        onSuccess: () => toast.success(p.approve ? t('admin.queue.approved') : t('admin.queue.rejected')),
        onError: (e) => toast.error(errorMessage(e)),
        onSettled: () => setPending(null),
      },
    );
  };

  const decide = (p: Pending) => {
    haptic.impact('medium');
    setPending(p);
    timer.current = setTimeout(() => commit(p), UNDO_MS);
  };

  const undo = () => {
    if (timer.current) clearTimeout(timer.current);
    setPending(null);
  };

  // Flush a pending decision if the moderator leaves the page.
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(
    () => () => {
      if (timer.current && pendingRef.current) {
        clearTimeout(timer.current);
        commit(pendingRef.current);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- unmount only
    [],
  );

  if (queue.isPending) return <Skeleton className="h-96 w-full" />;
  if (queue.isError) return <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />;

  const visible = queue.data.filter((q) => q.id !== pending?.item.id && !skipped.includes(q.id));
  const item = visible[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">{t('admin.queue.title')}</h1>
        <Badge tone="brand">{t('admin.queue.remaining', { count: visible.length })}</Badge>
      </div>

      {pending ? (
        <div role="status" className="flex items-center gap-3 rounded-card bg-ink px-4 py-3 text-sm text-surface">
          <span className="flex-1">
            {pending.approve ? t('admin.queue.approving', { title: pending.item.title }) : t('admin.queue.rejecting', { title: pending.item.title })}
          </span>
          <Button size="sm" variant="secondary" icon={Undo2} onClick={undo}>
            {t('admin.queue.undo')}
          </Button>
        </div>
      ) : null}

      {!item ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('admin.queue.emptyTitle')}
          description={skipped.length ? t('admin.queue.skippedBody', { count: skipped.length }) : t('admin.queue.emptyBody')}
          action={skipped.length ? <Button variant="secondary" block onClick={() => setSkipped([])}>{t('admin.queue.showSkipped')}</Button> : undefined}
        />
      ) : (
        <QueueCard
          key={item.id}
          item={item}
          busy={moderate.isPending}
          onApprove={() => decide({ item, approve: true })}
          onReject={() => setRejecting(true)}
          onSkip={() => setSkipped((s) => [...s, item.id])}
        />
      )}

      {rejecting && item ? (
        <ReasonSheet
          open
          title={t('admin.queue.rejectTitle')}
          reasons={LISTING_REJECT_REASONS}
          confirmLabel={t('admin.queue.reject')}
          onClose={() => setRejecting(false)}
          onConfirm={(reason, note) => {
            setRejecting(false);
            decide({ item, approve: false, reason, note });
          }}
        />
      ) : null}
    </div>
  );
}

function QueueCard({ item, busy, onApprove, onReject, onSkip }: { item: QueueItem; busy: boolean; onApprove: () => void; onReject: () => void; onSkip: () => void }) {
  const { t, i18n } = useTranslation();
  const urls = item.images.map((p) => imageUrl(p, 1280)).filter((u): u is string => Boolean(u));
  const fields = item.category ? CATEGORY_FIELDS[item.category] : [];
  const s = item.seller;
  return (
    <article className="space-y-3">
      <Card padded={false} className="overflow-hidden">
        <ImageGallery urls={urls} alt={item.title} />
        <div className="space-y-2 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <SlaBadge since={item.waiting_since} />
            {item.was_live ? <Badge tone="brand">{t('admin.queue.edited')}</Badge> : null}
            {item.is_free ? <Badge>{t('admin.queue.free')}</Badge> : <Badge tone="success">{t('admin.queue.paid')}</Badge>}
            {item.flags.map((f) => (
              <Badge key={f} tone="danger" icon={AlertTriangle}>
                {t(`flag.${f}`)}
              </Badge>
            ))}
          </div>
          <h2 className="text-lg font-bold leading-snug">{item.title}</h2>
          <div className="flex items-baseline gap-2">
            <PriceTag value={item.price} size="lg" />
            {item.median_price ? <span className="text-xs text-hint">{t('admin.queue.median', { price: formatEtb(item.median_price) })}</span> : null}
          </div>
          <p className="text-sm text-hint">
            {[item.category && t(`category.${item.category}`), item.brand, item.model, item.condition && t(`condition.${item.condition}`), item.city]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {fields.some((f) => item.specs[f.key] !== undefined) ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              {fields
                .filter((f) => item.specs[f.key] !== undefined)
                .map((f) => (
                  <div key={f.key} className="flex justify-between gap-2">
                    <dt className="text-hint">{t(`specs.${f.key}`)}</dt>
                    <dd className="font-medium">{String(item.specs[f.key])}</dd>
                  </div>
                ))}
            </dl>
          ) : null}
          <p className="whitespace-pre-wrap text-sm">{item.description}</p>
        </div>
      </Card>

      <Card className="space-y-1.5">
        <p className="flex items-center gap-1.5 text-sm font-semibold">
          {s.name} {s.username ? <span className="font-normal text-hint">@{s.username}</span> : null}
          {s.verified ? <BadgeCheck aria-label={t('seller.verified')} className="size-4 text-brand" /> : null}
        </p>
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-hint">
          <span>{t('seller.memberSince', { date: formatDate(s.member_since, i18n.language) })}</span>
          <span>{t('admin.queue.live', { count: s.live_count })}</span>
          <span>{t('seller.soldCount', { count: s.sold_count })}</span>
          {s.rating.count ? (
            <span className="inline-flex items-center gap-0.5">
              <Star aria-hidden className="size-3 fill-accent text-accent" /> {s.rating.rating} ({s.rating.count})
            </span>
          ) : null}
        </p>
        {s.past_rejections || s.open_reports ? (
          <Notice tone="warning" icon={Flag}>
            {t('admin.queue.trustWarning', { rejections: s.past_rejections, reports: s.open_reports })}
          </Notice>
        ) : null}
        <Link to={`/seller/${s.public_id}`} className="inline-block text-xs font-semibold text-brand">
          {t('admin.queue.sellerProfile')}
        </Link>
      </Card>

      <div className="sticky bottom-0 -mx-4 grid grid-cols-[auto_1fr_1fr] gap-2 border-t border-line bg-page/95 px-4 pt-3 backdrop-blur" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
        <Button variant="secondary" icon={SkipForward} onClick={onSkip} disabled={busy} aria-label={t('admin.queue.skip')}>
          <span className="sr-only">{t('admin.queue.skip')}</span>
        </Button>
        <Button variant="danger" icon={X} onClick={onReject} disabled={busy}>
          {t('admin.queue.reject')}
        </Button>
        <Button icon={Check} onClick={onApprove} disabled={busy}>
          {t('admin.queue.approve')}
        </Button>
      </div>
    </article>
  );
}
