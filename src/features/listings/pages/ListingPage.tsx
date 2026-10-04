import { ArrowLeftRight, Calendar, Flag, Heart, MapPin, MessageCircle, PackageX, Share2, ShieldCheck, Sparkles, Star, Tag } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PrimaryAction } from '../../../app/telegramHooks';
import {
  Avatar,
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  ImageGallery,
  PriceTag,
  RatingDisplay,
  Skeleton,
  VerifiedBadge,
  toast,
} from '../../../components/ui';
import { imageUrl } from '../../../lib/api/client';
import { toAppError } from '../../../lib/api/errors';
import type { ListingDetail, Specs } from '../../../lib/api/types';
import { formatDate, formatEtb, formatRelative } from '../../../lib/format';
import { haptic, shareLink } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useMe, usePermissions, useSettings } from '../../auth/hooks';
import { useSession } from '../../auth/session';
import { CATEGORY_FIELDS } from '../../sell/categoryFields';
import { registerView, useListing, useToggleFavorite } from '../api';
import { ContactSheet } from '../components/ContactSheet';
import { OwnerPanel } from '../components/OwnerPanel';
import { ReportSheet } from '../components/ReportSheet';
import { ReviewSheet } from '../components/ReviewSheet';
import { listingShareLink } from '../share';

export default function ListingPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const query = useListing(id);

  useEffect(() => {
    if (query.data && query.data.status === 'active' && !query.data.is_owner) void registerView(query.data.id);
  }, [query.data]);

  if (query.isPending) return <ListingSkeleton />;
  if (query.isError) {
    return toAppError(query.error).code === 'not_found' ? (
      <EmptyState
        icon={PackageX}
        title={t('listing.notFoundTitle')}
        description={t('listing.notFoundBody')}
        action={
          <Link to="/" className="font-semibold text-brand">
            {t('listing.backToBrowse')}
          </Link>
        }
      />
    ) : (
      <ErrorState error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  return <ListingView listing={query.data} />;
}

function ListingView({ listing }: { listing: ListingDetail }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const errorMessage = useErrorMessage();
  const session = useSession();
  const me = useMe();
  const perms = usePermissions(me.data);
  const settings = useSettings();
  const favorite = useToggleFavorite();
  const [sheet, setSheet] = useState<'contact' | 'report' | 'review' | null>(params.get('review') === '1' && listing.can_review ? 'review' : null);

  const urls = listing.images.map((p) => imageUrl(p, 1280)).filter((u): u is string => Boolean(u));
  const isLive = listing.status === 'active';
  const signedIn = session.status === 'authenticated';

  const onContact = () => {
    haptic.impact('light');
    if (!signedIn) {
      toast.info(t('guards.openInTelegramBody'));
      return;
    }
    if (perms.isBanned) {
      toast.error(errorMessage(new Error('banned')));
      return;
    }
    if (!me.data?.phone_verified) {
      navigate(`/verify-phone?next=${encodeURIComponent(`/p/${listing.id}`)}&reason=contact`);
      return;
    }
    setSheet('contact');
  };

  const onFavorite = () => {
    if (!signedIn) {
      toast.info(t('guards.openInTelegramBody'));
      return;
    }
    haptic.impact('light');
    favorite.mutate(listing.id, { onError: (e) => toast.error(errorMessage(e)) });
  };

  const onShare = () => {
    const text = `${listing.title} · ${formatEtb(listing.price)}${listing.city ? ` · ${listing.city}` : ''}`;
    shareLink(listingShareLink(settings.data, listing.id), text);
  };

  return (
    <article className="-mx-4 -mt-4 space-y-4">
      <div className="relative">
        <ImageGallery urls={urls} alt={listing.title} />
        <div className="absolute right-3 top-3 flex gap-2">
          <IconButton icon={Share2} label={t('listing.share')} variant="overlay" onClick={onShare} />
          {!listing.is_owner ? (
            <IconButton
              icon={Heart}
              label={listing.is_favorite ? t('listing.unsave') : t('listing.save')}
              variant="overlay"
              aria-pressed={listing.is_favorite}
              className={listing.is_favorite ? '[&_svg]:fill-current [&_svg]:text-[#f87171]' : undefined}
              onClick={onFavorite}
            />
          ) : null}
        </div>
      </div>

      <div className="space-y-4 px-4">
        {listing.is_owner || listing.manage ? <OwnerPanel listing={listing} /> : null}

        {listing.status === 'sold' ? (
          <Card className="flex items-center gap-2 bg-surface-2 text-sm font-semibold">
            <Tag aria-hidden className="size-5 text-hint" /> {t('listing.soldNotice')}
          </Card>
        ) : null}

        <header className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {listing.is_featured ? (
              <Badge tone="accent" icon={Sparkles}>
                {t('listing.featured')}
              </Badge>
            ) : null}
            {listing.condition ? <Badge tone="brand">{t(`condition.${listing.condition}`)}</Badge> : null}
            {listing.negotiable ? <Badge>{t('listing.negotiable')}</Badge> : null}
            {listing.exchange ? (
              <Badge icon={ArrowLeftRight}>{t('listing.exchange')}</Badge>
            ) : null}
          </div>
          <h1 className="text-xl font-bold leading-snug">{listing.title}</h1>
          <PriceTag value={listing.price} size="lg" />
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-hint">
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden className="size-4" />
              {listing.city}
            </span>
            {listing.published_at ? (
              <span className="inline-flex items-center gap-1">
                <Calendar aria-hidden className="size-4" />
                {formatRelative(listing.published_at, i18n.language)}
              </span>
            ) : null}
          </p>
        </header>

        <SpecTable listing={listing} />

        {listing.description ? (
          <section>
            <h2 className="mb-1.5 text-base font-bold">{t('listing.description')}</h2>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{listing.description}</p>
          </section>
        ) : null}

        <Link to={`/seller/${listing.seller.public_id}`} className="press block">
          <Card className="flex items-center gap-3">
            <Avatar name={listing.seller.name} size={48} />
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1 font-semibold">
                <span className="truncate">{listing.seller.name || t('seller.anonymous')}</span>
                {listing.seller.verified ? <VerifiedBadge /> : null}
              </p>
              <RatingDisplay rating={listing.seller.rating.rating} count={listing.seller.rating.count} />
              <p className="text-xs text-hint">
                {t('seller.memberSince', { date: formatDate(listing.seller.member_since, i18n.language) })} ·{' '}
                {t('seller.activeCount', { count: listing.seller.active_count })}
              </p>
            </div>
          </Card>
        </Link>

        <Card className="flex gap-2.5 bg-brand-soft text-sm shadow-none">
          <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
          <p className="text-ink/80">{t('listing.safetyShort')}</p>
        </Card>

        <div className="flex flex-wrap gap-2">
          {listing.can_review ? (
            <Button variant="soft" icon={Star} onClick={() => setSheet('review')}>
              {t('review.cta')}
            </Button>
          ) : null}
          {!listing.is_owner && signedIn ? (
            <Button variant="ghost" icon={Flag} onClick={() => setSheet('report')}>
              {t('report.cta')}
            </Button>
          ) : null}
        </div>
      </div>

      {isLive && !listing.is_owner ? <PrimaryAction text={t('listing.contactSeller')} onClick={onContact} /> : null}

      {sheet === 'contact' ? <ContactSheet listingId={listing.id} open onClose={() => setSheet(null)} /> : null}
      {sheet === 'report' ? <ReportSheet open targetType="product" targetId={listing.id} onClose={() => setSheet(null)} /> : null}
      {sheet === 'review' ? (
        <ReviewSheet
          open
          productId={listing.id}
          sellerName={listing.seller.name}
          onClose={() => {
            setSheet(null);
            if (params.get('review')) setParams({}, { replace: true });
          }}
        />
      ) : null}
      {!isLive && !listing.is_owner && listing.status !== 'sold' ? (
        <p className="flex items-center justify-center gap-1.5 px-4 text-sm text-hint">
          <MessageCircle aria-hidden className="size-4" /> {t('listing.notLive')}
        </p>
      ) : null}
    </article>
  );
}

function SpecTable({ listing }: { listing: ListingDetail }) {
  const { t } = useTranslation();
  const rows: Array<[string, string]> = [];
  if (listing.category) rows.push([t('fields.category'), t(`category.${listing.category}`)]);
  if (listing.brand) rows.push([t('fields.brand'), listing.brand]);
  if (listing.model) rows.push([t('fields.model'), listing.model]);
  const fields = listing.category ? CATEGORY_FIELDS[listing.category] : [];
  const specs: Specs = listing.specs ?? {};
  for (const f of fields) {
    const v = specs[f.key];
    if (v === undefined || v === '') continue;
    const value = typeof v === 'boolean' ? (v ? t('common.yes') : t('common.no')) : f.type === 'number' && f.unit ? `${v}${f.unit}` : String(v);
    rows.push([t(`specs.${f.key}`), value]);
  }
  if (rows.length === 0) return null;
  return (
    <section>
      <h2 className="mb-1.5 text-base font-bold">{t('listing.details')}</h2>
      <dl className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-4 py-2.5 text-sm">
            <dt className="text-hint">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function ListingSkeleton() {
  return (
    <div className="-mx-4 -mt-4 space-y-4" role="status" aria-busy="true">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="space-y-3 px-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-6 w-4/5" />
        <Skeleton className="h-8 w-1/2" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  );
}
