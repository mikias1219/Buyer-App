import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { DebtPaymentMethod } from '../../lib/api/types';

export function useCustomers(q: string, owingOnly = false) {
  return useInfiniteQuery({
    queryKey: qk.customers.list(q, owingOnly),
    queryFn: ({ pageParam }) => rpc('list_customers', { p_q: q || null, p_owing_only: owingOnly, p_limit: 40, p_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
}

export function useCustomer(id: string) {
  return useQuery({ queryKey: qk.customers.detail(id), queryFn: () => rpc('get_customer', { p_id: id }), enabled: Boolean(id) });
}

export function useSaveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; name: string; phone?: string; note?: string }) => rpc('upsert_customer', { p_input: input }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.customers.all }),
  });
}

export function useArchiveCustomer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => rpc('set_customer_archived', { p_id: id, p_archived: archived }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.customers.all }),
  });
}

export function useRecordPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: { customerId: string; amount: number; method: DebtPaymentMethod; note: string }) =>
      rpc('record_customer_payment', { p_customer_id: a.customerId, p_amount: a.amount, p_method: a.method, p_note: a.note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.customers.all });
      void qc.invalidateQueries({ queryKey: qk.reports.all });
    },
  });
}
