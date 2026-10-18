import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { callFunction, requireBackend, rpc } from '../../lib/api/client';
import type { ProductFilters, ProductInput, ProductStatus, RestockItem } from '../../lib/api/types';
import { prepareImage } from '../../lib/image';

const PAGE = 40;

/** Anything that changes stock or prices invalidates products, sales views and reports. */
export function invalidateStock(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.products.all });
  void qc.invalidateQueries({ queryKey: qk.reports.all });
  void qc.invalidateQueries({ queryKey: ['categories'] });
}

export function useProducts(filters: ProductFilters) {
  return useInfiniteQuery({
    queryKey: qk.products.list(filters),
    queryFn: ({ pageParam }) => rpc('list_products', { p_filters: filters, p_limit: PAGE, p_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

export function useProduct(id: string | undefined) {
  return useQuery({
    queryKey: qk.products.detail(id ?? ''),
    queryFn: () => rpc('get_product', { p_id: id ?? '' }),
    enabled: Boolean(id),
  });
}

export function useMovements(id: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: qk.products.movements(id),
    queryFn: ({ pageParam }) => rpc('product_movements', { p_product_id: id, p_before: pageParam, p_limit: 30 }),
    initialPageParam: null as number | null,
    getNextPageParam: (last) => (last.length === 30 ? (last[last.length - 1]?.id ?? undefined) : undefined),
    enabled,
  });
}

export function useLowStock(limit = 20) {
  return useQuery({ queryKey: [...qk.products.lowStock, limit], queryFn: () => rpc('low_stock', { p_limit: limit }) });
}

export function useCategories(includeArchived = false) {
  return useQuery({
    queryKey: qk.categories(includeArchived),
    queryFn: () => rpc('list_categories', { p_include_archived: includeArchived }),
    staleTime: 5 * 60_000,
  });
}

export function useSaveProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ProductInput }) =>
      id ? rpc('update_product', { p_id: id, p_input: input }) : rpc('create_product', { p_input: input }),
    onSuccess: (p) => {
      qc.setQueryData(qk.products.detail(p.id), p);
      invalidateStock(qc);
    },
  });
}

export function useSetProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductStatus }) => rpc('set_product_status', { p_id: id, p_status: status }),
    onSuccess: (p) => {
      qc.setQueryData(qk.products.detail(p.id), p);
      invalidateStock(qc);
    },
  });
}

export function useDeleteProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => rpc('delete_product', { p_id: id }),
    onSuccess: () => invalidateStock(qc),
  });
}

export function useRestock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { items: RestockItem[]; supplier: string; note: string }) =>
      rpc('restock', { p_items: args.items, p_supplier: args.supplier, p_note: args.note }),
    onSuccess: (products) => {
      for (const p of products) qc.setQueryData(qk.products.detail(p.id), p);
      invalidateStock(qc);
    },
  });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { productId: string; mode: 'set' | 'loss'; qty: number; reason: string }) =>
      rpc('adjust_stock', { p_product_id: args.productId, p_mode: args.mode, p_qty: args.qty, p_reason: args.reason }),
    onSuccess: (p) => {
      qc.setQueryData(qk.products.detail(p.id), p);
      invalidateStock(qc);
    },
  });
}

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; sort?: number }) => rpc('upsert_category', { p_input: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['categories'] });
      void qc.invalidateQueries({ queryKey: qk.products.all });
    },
  });
}

export function useArchiveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => rpc('set_category_archived', { p_id: id, p_archived: archived }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['categories'] }),
  });
}

/** Compress, get a signed upload URL (owner only), upload. Returns the storage path. */
export async function uploadProductImage(file: File): Promise<string> {
  const prepared = await prepareImage(file);
  const signed = await callFunction('storage', { action: 'product-image', ext: prepared.ext });
  const backend = await requireBackend();
  await backend.uploadToSignedUrl('product-images', signed.path, signed.token, prepared.blob);
  return signed.path;
}
