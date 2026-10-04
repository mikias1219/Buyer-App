import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { callFunction, requireBackend, rpc } from '../../lib/api/client';
import { AppError } from '../../lib/api/errors';
import type { Category, ListingImage, ListingInput } from '../../lib/api/types';
import { prepareImage } from '../../lib/image';
import { useSession } from '../auth/session';

export function useMyListings() {
  const { status } = useSession();
  return useQuery({ queryKey: qk.myListings, queryFn: () => rpc('my_listings', {}), enabled: status === 'authenticated' });
}

export function useMyListing(id: string | undefined) {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.myListing(id ?? ''),
    queryFn: () => rpc('get_my_listing', { p_id: id ?? '' }),
    enabled: Boolean(id) && status === 'authenticated',
  });
}

export function usePriceHint(category: Category | null | undefined, brand: string) {
  return useQuery({
    queryKey: qk.priceHint(category ?? '', brand),
    queryFn: () => rpc('price_hint', { p_category: category as Category, p_brand: brand || null }),
    enabled: Boolean(category),
    staleTime: 10 * 60_000,
  });
}

function useInvalidateSeller() {
  const qc = useQueryClient();
  return (id?: string) => {
    void qc.invalidateQueries({ queryKey: qk.myListings });
    void qc.invalidateQueries({ queryKey: qk.me });
    if (id) {
      void qc.invalidateQueries({ queryKey: qk.myListing(id) });
      void qc.invalidateQueries({ queryKey: qk.listing(id) });
    }
  };
}

export function useCreateDraft() {
  const invalidate = useInvalidateSeller();
  return useMutation({
    mutationFn: (input: ListingInput) => rpc('create_listing', { p_input: input }),
    onSuccess: () => invalidate(),
  });
}

export function useSaveListing() {
  const invalidate = useInvalidateSeller();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ListingInput }) => rpc('update_listing', { p_id: id, p_input: input }),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

export function useSetImages() {
  const invalidate = useInvalidateSeller();
  return useMutation({
    mutationFn: ({ id, images }: { id: string; images: ListingImage[] }) => rpc('set_listing_images', { p_id: id, p_images: images }),
    onSuccess: (_d, v) => invalidate(v.id),
  });
}

export function useSubmitListing() {
  const invalidate = useInvalidateSeller();
  return useMutation({
    mutationFn: (id: string) => rpc('submit_listing', { p_id: id }),
    onSuccess: (_d, id) => invalidate(id),
  });
}

export function useSetListingStatus() {
  const invalidate = useInvalidateSeller();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'paused' | 'active' | 'sold' }) =>
      rpc('set_listing_status', { p_id: id, p_status: status }),
    onSuccess: (_d, v) => {
      invalidate(v.id);
    },
  });
}

export function useRenewListing() {
  const invalidate = useInvalidateSeller();
  return useMutation({ mutationFn: (id: string) => rpc('renew_listing', { p_id: id }), onSuccess: (_d, id) => invalidate(id) });
}

export function useDeleteListing() {
  const invalidate = useInvalidateSeller();
  return useMutation({ mutationFn: (id: string) => rpc('delete_listing', { p_id: id }), onSuccess: () => invalidate() });
}

export function useCreateBoost() {
  const invalidate = useInvalidateSeller();
  return useMutation({ mutationFn: (id: string) => rpc('create_boost_payment', { p_id: id }), onSuccess: (_d, id) => invalidate(id) });
}

/** Compress, upload through a signed URL, and return the stored path + hash. */
export async function uploadListingPhoto(productId: string, file: Blob): Promise<ListingImage> {
  const prepared = await prepareImage(file);
  const signed = await callFunction('storage', { action: 'listing-image', product_id: productId, ext: prepared.ext });
  if (!signed.path || !signed.token) throw new AppError('upload_failed');
  const backend = await requireBackend();
  await backend.uploadToSignedUrl('listing-images', signed.path, signed.token, prepared.blob);
  return { path: signed.path, hash: prepared.hash };
}

export async function uploadPaymentProof(file: Blob): Promise<string> {
  const prepared = await prepareImage(file);
  const signed = await callFunction('storage', { action: 'payment-proof', ext: prepared.ext });
  if (!signed.path || !signed.token) throw new AppError('upload_failed');
  const backend = await requireBackend();
  await backend.uploadToSignedUrl('payment-proofs', signed.path, signed.token, prepared.blob);
  return signed.path;
}
