import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ListingCard, ListingCardSkeleton, Section } from '../../../components/ui';
import type { ListingCard as Card } from '../../../lib/api/types';

/** Horizontal rail of listing cards on Home. Hidden when empty (Home shows one global empty state). */
export function ListingRail({ title, items, loading, moreTo }: { title: string; items: Card[] | undefined; loading: boolean; moreTo: string }) {
  const { t } = useTranslation();
  if (!loading && (!items || items.length === 0)) return null;
  return (
    <Section
      title={title}
      action={
        <Link to={moreTo} className="press inline-flex min-h-9 items-center gap-0.5 text-sm font-semibold text-brand">
          {t('home.seeAll')}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      }
    >
      <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
        {loading
          ? Array.from({ length: 3 }, (_, i) => (
              <li key={i} className="w-[44%] shrink-0">
                <ListingCardSkeleton />
              </li>
            ))
          : items?.map((it) => (
              <li key={it.id} className="w-[44%] shrink-0 snap-start">
                <ListingCard item={it} className="h-full" />
              </li>
            ))}
      </ul>
    </Section>
  );
}
