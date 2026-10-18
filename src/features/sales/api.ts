import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { PaymentMethod, SaleItemInput, SalesFilters } from '../../lib/api/types';

const PAGE = 30;

/** A sale changes stock, sales lists, reports and (credit) customer balances. */
export function invalidateAfterSale(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.sales.all });
  void qc.invalidateQueries({ queryKey: qk.products.all });
  void qc.invalidateQueries({ queryKey: qk.reports.all });
  void qc.invalidateQueries({ queryKey: qk.customers.all });
}

export function useSales(filters: SalesFilters) {
  return useInfiniteQuery({
    queryKey: qk.sales.list(filters),
    queryFn: ({ pageParam }) => rpc('list_sales', { p_filters: filters, p_limit: PAGE, p_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total_count ? loaded : undefined;
    },
  });
}

export function useSale(id: string) {
  return useQuery({ queryKey: qk.sales.detail(id), queryFn: () => rpc('get_sale', { p_id: id }), enabled: Boolean(id) });
}

export interface RecordSaleArgs {
  clientRef: string;
  items: SaleItemInput[];
  paymentMethod: PaymentMethod;
  discount: number;
  note: string;
  customerId: string | null;
}

export function useRecordSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: RecordSaleArgs) =>
      rpc('record_sale', {
        p_client_ref: a.clientRef,
        p_items: a.items,
        p_payment_method: a.paymentMethod,
        p_discount: a.discount,
        p_note: a.note,
        p_customer_id: a.customerId,
      }),
    onSuccess: (sale) => {
      qc.setQueryData(qk.sales.detail(sale.id), sale);
      invalidateAfterSale(qc);
    },
  });
}

export function useVoidSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rpc('void_sale', { p_id: id, p_reason: reason }),
    onSuccess: (sale) => {
      qc.setQueryData(qk.sales.detail(sale.id), sale);
      invalidateAfterSale(qc);
    },
  });
}

export function useReturnItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { saleId: string; items: Array<{ sale_item_id: number; qty: number }>; reason: string }) =>
      rpc('return_sale_items', { p_sale_id: a.saleId, p_items: a.items, p_reason: a.reason }),
    onSuccess: (sale) => {
      qc.setQueryData(qk.sales.detail(sale.id), sale);
      invalidateAfterSale(qc);
    },
  });
}
