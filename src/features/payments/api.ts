import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { PaymentDetail } from '../../lib/api/types';
import { useSession } from '../auth/session';
import { providerFor } from './provider';

/** Polls while the payment waits for an admin, so the screen updates without a refresh. */
export function usePayment(id: string | undefined) {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.payment(id ?? ''),
    queryFn: () => rpc('get_payment', { p_id: id ?? '' }),
    enabled: Boolean(id) && status === 'authenticated',
    refetchInterval: (q) => (q.state.data?.status === 'submitted' ? 20_000 : false),
  });
}

export function useSubmitPayment(payment: PaymentDetail | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { reference: string; screenshotPath?: string }) => {
      if (!payment) throw new Error('payment not loaded');
      return providerFor(payment).submit(payment.id, v.reference, v.screenshotPath);
    },
    onSuccess: (data) => {
      qc.setQueryData<PaymentDetail>(qk.payment(data.id), (old) => (old ? { ...old, ...data } : data));
      void qc.invalidateQueries({ queryKey: qk.myListings });
      void qc.invalidateQueries({ queryKey: qk.listing(data.product.id) });
    },
  });
}
