import { zodResolver } from '@hookform/resolvers/zod';
import { Lock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { PrimaryAction } from '../../../app/telegramHooks';
import { EmptyState, ErrorState, Notice, Skeleton, Stepper, toast } from '../../../components/ui';
import type { DraftListing } from '../../../lib/api/types';
import { haptic } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { canEdit } from '../../listings/logic';
import { useMyListing, useSaveListing, useSetImages, useSubmitListing } from '../api';
import { DetailsStep } from '../components/DetailsStep';
import { PhotosStep } from '../components/PhotosStep';
import { PriceStep } from '../components/PriceStep';
import { ReviewStep } from '../components/ReviewStep';
import { diffInput, draftToForm, listingFormSchema, MIN_PHOTOS, STEP_FIELDS, STEPS, type ListingFormValues, type Step } from '../schema';
import { usePhotoUploads } from '../usePhotoUploads';

/**
 * 3-step sell wizard (+ review), also used to edit existing listings (mode="edit").
 * Progress is saved to the draft on every "Next", so sellers can leave and resume from Mine → Drafts.
 */
export default function SellWizardPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string; step?: string }>();
  const { t } = useTranslation();
  const listing = useMyListing(id);

  if (listing.isPending) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (listing.isError) return <ErrorState error={listing.error} onRetry={() => void listing.refetch()} />;
  if (!canEdit(listing.data.status)) {
    return <EmptyState icon={Lock} title={t('sell.lockedTitle')} description={t(`owner.statusHelp.${listing.data.status}`)} />;
  }
  return <Wizard key={listing.data.id} mode={mode} listing={listing.data} />;
}

function Wizard({ mode, listing }: { mode: 'create' | 'edit'; listing: DraftListing }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams<{ step?: string }>();
  const errorMessage = useErrorMessage();
  const base = mode === 'create' ? `/sell/${listing.id}` : `/mine/${listing.id}/edit`;
  const step: Step = STEPS.includes(params.step as Step) ? (params.step as Step) : mode === 'edit' ? 'details' : firstIncompleteStep(listing);
  const stepIndex = STEPS.indexOf(step);

  const initial = useMemo(() => draftToForm(listing), [listing]);
  const [saved, setSaved] = useState(initial);
  const form = useForm<ListingFormValues>({
    resolver: zodResolver(listingFormSchema),
    defaultValues: initial,
    mode: 'onTouched',
  });
  const photos = usePhotoUploads(listing.id, listing.images);
  const [photoError, setPhotoError] = useState<string>();

  const save = useSaveListing();
  const setImages = useSetImages();
  const submit = useSubmitListing();
  const busy = save.isPending || setImages.isPending || submit.isPending;

  useEffect(() => {
    if (!params.step) navigate(`${base}/${step}`, { replace: true });
  }, [params.step, base, step, navigate]);

  const persist = async (): Promise<boolean> => {
    try {
      if (photos.isDirty()) {
        await setImages.mutateAsync({ id: listing.id, images: photos.images });
        photos.markSaved();
      }
      const values = form.getValues();
      const changes = diffInput(saved, values);
      if (Object.keys(changes).length) {
        const r = await save.mutateAsync({ id: listing.id, input: changes });
        setSaved(values);
        if (r.needs_review) toast.info(t('sell.sentForReview'));
      }
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    }
  };

  const goTo = (s: Step) => navigate(`${base}/${s}`);

  const next = async () => {
    haptic.impact('light');
    if (step === 'photos') {
      if (photos.uploading) return setPhotoError(t('sell.photos.waitUpload'));
      if (photos.images.length < MIN_PHOTOS) return setPhotoError(t('sell.photos.needOne'));
      setPhotoError(undefined);
    } else if (step === 'details' || step === 'price') {
      const ok = await form.trigger(STEP_FIELDS[step], { shouldFocus: true });
      if (!ok) {
        haptic.notify('error');
        return;
      }
    }
    if (step === 'review') return finish();
    if (await persist()) goTo(STEPS[stepIndex + 1] ?? 'review');
  };

  const finish = async () => {
    const ok = await form.trigger();
    if (!ok) {
      const firstBad = (Object.keys(form.formState.errors) as Array<keyof ListingFormValues>)[0];
      goTo(STEP_FIELDS.price.includes(firstBad as keyof ListingFormValues) ? 'price' : 'details');
      return;
    }
    if (!(await persist())) return;
    const needsSubmit = listing.status === 'draft' || listing.status === 'rejected';
    if (!needsSubmit) {
      toast.success(t('sell.saved'));
      navigate(listing.status === 'pending_payment' ? '/mine?tab=action' : `/p/${listing.id}`, { replace: true });
      return;
    }
    submit.mutate(listing.id, {
      onSuccess: (r) => {
        haptic.notify('success');
        navigate(r.payment_id ? `/pay/${r.payment_id}` : `/sell/done/${listing.id}`, { replace: true });
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const values = useWatch({ control: form.control }) as ListingFormValues;
  const primaryText =
    step === 'review'
      ? listing.status === 'draft' || listing.status === 'rejected'
        ? t('sell.submit')
        : t('sell.saveChanges')
      : t('common.next');

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <h1 className="text-lg font-bold">{mode === 'create' ? t('sell.title') : t('sell.editTitle')}</h1>
        <Stepper label={t('sell.progress')} current={stepIndex} steps={STEPS.map((s) => t(`sell.steps.${s}`))} />
      </div>

      {listing.reject_reason && mode === 'edit' ? (
        <Notice tone="danger" title={t(`rejectReason.${listing.reject_reason}`)}>
          {listing.reject_note || t('owner.fixHint')}
        </Notice>
      ) : null}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
      >
        {step === 'photos' ? <PhotosStep photos={photos} error={photoError} /> : null}
        {step === 'details' ? <DetailsStep control={form.control} setValue={form.setValue} /> : null}
        {step === 'price' ? <PriceStep control={form.control} /> : null}
        {step === 'review' ? <ReviewStep values={values} images={photos.images} listing={listing} mode={mode} onEdit={goTo} /> : null}
      </form>

      <PrimaryAction text={primaryText} onClick={() => void next()} loading={busy} disabled={step === 'photos' && photos.uploading} />
    </div>
  );
}

function firstIncompleteStep(d: DraftListing): Step {
  if (d.missing.includes('photos')) return 'photos';
  if (['title', 'description', 'category', 'condition', 'city'].some((f) => d.missing.includes(f))) return 'details';
  if (d.missing.includes('price')) return 'price';
  return 'review';
}
