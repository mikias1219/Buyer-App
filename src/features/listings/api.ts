import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { FavoriteItem, ListingDetail, ReportReason, SearchArgs } from '../../lib/api/types';
import { useSession } from '../auth/session';
import type { SearchFilters } from './schema';

export const PAGE_SIZE = 20;

export function toSearchArgs(f: SearchFilters): SearchArgs {
  return {
    p_query: f.q || null,
    p_category: f.category ?? null,
    p_conditions: f.conditions.length ? f.conditions : null,
    p_city: f.city || null,
    p_brand: f.brand || null,
    p_min_price: f.minPrice ?? null,
    p_max_price: f.maxPrice ?? null,
    p_specs: f.specs && Object.keys(f.specs).length ? f.specs : null,
    p_sort: f.sort,
    p_featured_only: f.featured,
    p_limit: PAGE_SIZE,
  };
}

export function useHomeFeed(city: string | null) {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.home(city),
    queryFn: () => rpc('home_feed', { p_city: city }),
    enabled: status !== 'booting' && status !== 'unconfigured',
  });
}

export function useSearch(filters: SearchFilters) {
  const { status } = useSession();
  return useInfiniteQuery({
    queryKey: qk.search(filters),
    queryFn: ({ pageParam }) => rpc('search_listings', { ...toSearchArgs(filters), p_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => last.next_offset ?? undefined,
    placeholderData: keepPreviousData,
    enabled: status !== 'booting' && status !== 'unconfigured',
  });
}

export function useListing(id: string | undefined) {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.listing(id ?? ''),
    queryFn: () => rpc('get_listing', { p_id: id ?? '' }),
    enabled: Boolean(id) && status !== 'booting' && status !== 'unconfigured',
  });
}

export function useSeller(publicId: string | undefined) {
  return useQuery({
    queryKey: qk.seller(publicId ?? ''),
    queryFn: () => rpc('get_seller', { p_public_id: publicId ?? '' }),
    enabled: Boolean(publicId),
  });
}

export function useFavorites() {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.favorites,
    queryFn: () => rpc('my_favorites', {}),
    enabled: status === 'authenticated',
  });
}

function patchListing(qc: QueryClient, id: string, patch: (l: ListingDetail) => ListingDetail) {
  qc.setQueryData<ListingDetail>(qk.listing(id), (old) => (old ? patch(old) : old));
}

/** Optimistic favorite toggle with rollback (spec Phase 2 §2). */
export function useToggleFavorite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc('toggle_favorite', { p_id: id }),
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: qk.listing(id) });
      await qc.cancelQueries({ queryKey: qk.favorites });
      const prevListing = qc.getQueryData<ListingDetail>(qk.listing(id));
      const prevFavorites = qc.getQueryData<FavoriteItem[]>(qk.favorites);
      patchListing(qc, id, (l) => ({
        ...l,
        is_favorite: !l.is_favorite,
        favorites_count: l.favorites_count + (l.is_favorite ? -1 : 1),
      }));
      if (prevFavorites && prevFavorites.some((f) => f.id === id)) {
        qc.setQueryData<FavoriteItem[]>(qk.favorites, prevFavorites.filter((f) => f.id !== id));
      }
      return { prevListing, prevFavorites };
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prevListing) qc.setQueryData(qk.listing(id), ctx.prevListing);
      if (ctx?.prevFavorites) qc.setQueryData(qk.favorites, ctx.prevFavorites);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: qk.favorites }),
  });
}

export function useRequestContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc('request_contact', { p_id: id }),
    onSuccess: (_d, id) => qc.invalidateQueries({ queryKey: qk.listing(id) }),
  });
}

export async function registerView(id: string): Promise<void> {
  const key = `tm_viewed_${id}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, '1');
  } catch {
    /* storage unavailable: the server dedupes per day anyway */
  }
  await rpc('register_view', { p_id: id }).catch(() => undefined);
}

export function useSubmitReport() {
  return useMutation({
    mutationFn: (v: { targetType: 'product' | 'user'; targetId: string; reason: ReportReason; note: string }) =>
      rpc('submit_report', { p_target_type: v.targetType, p_target_id: v.targetId, p_reason: v.reason, p_note: v.note }),
  });
}

export function useSubmitReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { productId: string; rating: number; comment: string }) =>
      rpc('submit_review', { p_product_id: v.productId, p_rating: v.rating, p_comment: v.comment }),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: qk.listing(v.productId) }),
  });
}
