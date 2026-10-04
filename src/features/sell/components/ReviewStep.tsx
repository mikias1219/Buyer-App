import { BadgeCheck, CreditCard, Gift, PencilLine } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Card, ListingCard, Notice, Section } from '../../../components/ui';
import type { ListingImage, ListingStatus } from '../../../lib/api/types';
import { formatEtb } from '../../../lib/format';
import { useMe, useSettings } from '../../auth/hooks';
import { decideSubmission } from '../../listings/logic';
import type { ListingFormValues, Step } from '../schema';

export function ReviewStep({
  values,
  images,
  listing,
  mode,
  onEdit,
}: {
  values: ListingFormValues;
  images: ListingImage[];
  listing: { id: string; status: ListingStatus; published_at: string | null; is_free: boolean; period_paid: boolean };
  mode: 'create' | 'edit';
  onEdit: (step: Step) => void;
}) {
  const { t } = useTranslation();
  const me = useMe();
  const settings = useSettings();
  const submitting = listing.status === 'draft' || listing.status === 'rejected';
  const decision =
    me.data && settings.data
      ? decideSubmission({
          feeEtb: settings.data.listing_fee_etb,
          freeQuota: settings.data.free_listings_quota,
          freeUsed: settings.data.free_listings_quota - me.data.free_listings_left,
          isFree: listing.is_free,
          periodPaid: listing.period_paid,
          publishedAt: listing.published_at,
        })
      : null;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">{t('sell.review.title')}</h2>
        <p className="text-sm text-hint">{t('sell.review.subtitle')}</p>
      </div>

      <div className="mx-auto w-1/2 min-w-[180px]">
        <ListingCard
          item={{
            id: listing.id,
            title: values.title || t('mine.untitled'),
            price: values.price,
            category: values.category,
            brand: values.brand,
            model: values.model,
            condition: values.condition,
            city: values.city,
            negotiable: values.negotiable,
            exchange: values.exchange,
            is_featured: false,
            published_at: new Date().toISOString(),
            cover_path: images[0]?.path ?? null,
            seller_verified: Boolean(me.data?.is_verified_seller),
          }}
        />
      </div>

      <Section title={t('sell.review.summary')}>
        <Card className="divide-y divide-line p-0">
          {(
            [
              ['photos', t('sell.steps.photos'), t('sell.review.photoCount', { count: images.length })],
              ['details', t('sell.steps.details'), [values.category && t(`category.${values.category}`), values.condition && t(`condition.${values.condition}`), values.city].filter(Boolean).join(' · ')],
              ['price', t('sell.steps.price'), [formatEtb(values.price), values.negotiable && t('listing.negotiable'), values.exchange && t('listing.exchange')].filter(Boolean).join(' · ')],
            ] as const
          ).map(([step, label, value]) => (
            <div key={step} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-hint">{label}</p>
                <p className="truncate text-sm font-medium">{value}</p>
              </div>
              <Button size="sm" variant="ghost" icon={PencilLine} onClick={() => onEdit(step)}>
                {t('common.edit')}
              </Button>
            </div>
          ))}
        </Card>
      </Section>

      {mode === 'create' || submitting ? (
        decision?.status === 'pending_payment' ? (
          <Notice tone="warning" icon={CreditCard} title={t('sell.review.feeTitle', { fee: formatEtb(settings.data?.listing_fee_etb ?? 0) })}>
            {t('sell.review.feeBody')}
          </Notice>
        ) : decision ? (
          <Notice tone="success" icon={Gift} title={decision.free ? t('sell.review.freeTitle') : t('sell.review.coveredTitle')}>
            {decision.consumesQuota
              ? t('sell.review.freeBody', { count: Math.max((me.data?.free_listings_left ?? 1) - 1, 0) })
              : t('sell.review.reviewBody')}
          </Notice>
        ) : null
      ) : listing.status === 'active' || listing.status === 'paused' ? (
        <Notice tone="brand" icon={BadgeCheck}>
          {t('sell.review.editLiveBody')}
        </Notice>
      ) : null}

      <p className="flex flex-wrap items-center gap-1.5 text-xs text-hint">
        <Badge tone="brand">{t('sell.review.contactNote')}</Badge>
        {me.data?.username ? t('sell.review.contactUsername', { username: me.data.username }) : t('sell.review.contactPhone')}
      </p>
    </div>
  );
}
