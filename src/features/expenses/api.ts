import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { ExpenseCategory, ExpenseInput } from '../../lib/api/types';

type Filters = { from: string; to: string; categories?: ExpenseCategory[] };

export function useExpenses(filters: Filters) {
  return useInfiniteQuery({
    queryKey: qk.expenses.list(filters),
    queryFn: ({ pageParam }) => rpc('list_expenses', { p_filters: filters, p_limit: 50, p_offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total_count ? loaded : undefined;
    },
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: qk.expenses.all });
    void qc.invalidateQueries({ queryKey: qk.reports.all });
  };
}

export function useSaveExpense() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: ExpenseInput }) =>
      id ? rpc('update_expense', { p_id: id, p_input: input }) : rpc('create_expense', { p_input: input }),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => rpc('delete_expense', { p_id: id }), onSuccess: invalidate });
}
