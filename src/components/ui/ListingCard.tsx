import { ImageOff, MapPin, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { imageUrl } from '../../lib/api/client';
import type { ListingCard as Card } from '../../lib/api/types';
import { formatRelative } from '../../lib/format';
import { Badge } from './Badge';
import { PriceTag } from './PriceTag';
import { VerifiedBadge } from './VerifiedBadge';
import { cn } from './cn';

/** Grid card for browse/search/favorites. `note` overrides the footer (e.g. "Sold"). */
export function ListingCard({ item, note, dimmed, className }: { item: Card; note?: string; dimmed?: boolean; className?: string }) {
  const { t, i18n } = useTranslation();
  const src = imageUrl(item.cover_path, 480);
  return (
    <Link
      to={`/p/${item.id}`}
      className={cn('press group flex flex-col overflow-hidden rounded-card bg-surface shadow-card', dimmed && 'opacity-60', className)}
    >
      <div className="relative aspect-[4/3] bg-surface-2">
        {src ? (
          <img src={src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-hint">
            <ImageOff aria-hidden className="size-7" />
          </div>
        )}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {item.is_featured ? (
            <Badge tone="accent" icon={Sparkles}>
              {t('listing.featured')}
            </Badge>
          ) : null}
          {item.condition ? <Badge tone="overlay">{t(`condition.${item.condition}`)}</Badge> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 p-3">
        <h3 className="line-clamp-2 min-h-[2.6em] text-sm font-medium leading-snug text-ink">{item.title}</h3>
        <PriceTag value={item.price} />
        <p className="mt-auto flex items-center gap-1 pt-1 text-xs text-hint">
          {note ? (
            <span className="font-semibold text-warning">{note}</span>
          ) : (
            <>
              <MapPin aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate">{item.city}</span>
              <span aria-hidden>·</span>
              <span className="shrink-0">{formatRelative(item.published_at, i18n.language)}</span>
              {item.seller_verified ? <VerifiedBadge className="ml-auto" /> : null}
            </>
          )}
        </p>
      </div>
    </Link>
  );
}
