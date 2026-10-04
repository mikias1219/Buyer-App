import { Gift, PencilLine, Plus } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, ErrorState, ListingRow, Notice, PageHeader, Section, Skeleton, toast } from '../../../components/ui';
import { formatEtb, formatRelative } from '../../../lib/format';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useMe, useSettings } from '../../auth/hooks';
import { useCreateDraft, useMyListings } from '../api';

/** Entry point of the Sell tab: resume a recent draft or start a new one. */
export default function SellStartPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const me = useMe();
  const settings = useSettings();
  const mine = useMyListings();
  const create = useCreateDraft();
  const drafts = (mine.data ?? []).filter((l) => l.status === 'draft').slice(0, 3);
  const autoStarted = useRef(false);

  const start = () =>
    create.mutate(
      { city: me.data?.city ?? '' },
      { onSuccess: (id) => navigate(`/sell/${id}/photos`, { replace: true }), onError: (e) => toast.error(errorMessage(e)) },
    );

  // No drafts to resume → go straight into the wizard.
  useEffect(() => {
    if (autoStarted.current || !mine.isSuccess || drafts.length > 0) return;
    autoStarted.current = true;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when drafts are known
  }, [mine.isSuccess, drafts.length]);

  if (mine.isError) return <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />;
  if (create.isError) return <ErrorState error={create.error} onRetry={start} />;
  if (mine.isPending || drafts.length === 0) {
    return (
      <div className="space-y-3" role="status" aria-busy="true">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const free = me.data?.free_listings_left ?? 0;
  return (
    <div className="space-y-5">
      <PageHeader title={t('sell.startTitle')} subtitle={t('sell.startSubtitle')} />
      {settings.data ? (
        <Notice tone={free ? 'success' : 'brand'} icon={Gift}>
          {free ? t('mine.freeLeft', { count: free }) : t('sell.feeNotice', { fee: formatEtb(settings.data.listing_fee_etb) })}
        </Notice>
      ) : null}
      <Section title={t('sell.resumeDraft')}>
        <ul className="space-y-2">
          {drafts.map((d) => (
            <li key={d.id}>
              <ListingRow
                title={d.title || t('mine.untitled')}
                price={d.price}
                coverPath={d.cover_path}
                meta={t('sell.lastEdited', { when: formatRelative(d.updated_at, i18n.language) })}
                onClick={() => navigate(`/sell/${d.id}`)}
              >
                <Button size="sm" variant="secondary" icon={PencilLine} onClick={() => navigate(`/sell/${d.id}`)}>
                  {t('owner.action.continue')}
                </Button>
              </ListingRow>
            </li>
          ))}
        </ul>
      </Section>
      <Button block size="lg" icon={Plus} loading={create.isPending} onClick={start}>
        {t('sell.startNew')}
      </Button>
    </div>
  );
}
