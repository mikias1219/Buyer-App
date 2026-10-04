import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { callFunction, rpc } from '../../lib/api/client';
import type { AdminSettings, ListingRejectReason, PaymentRejectReason, Role } from '../../lib/api/types';

export function useAdminDashboard() {
  return useQuery({ queryKey: qk.admin.dashboard, queryFn: () => rpc('admin_dashboard', {}), refetchInterval: 60_000 });
}
export function useReviewQueue() {
  return useQuery({ queryKey: qk.admin.queue, queryFn: () => rpc('admin_review_queue', { p_limit: 50 }) });
}
export function useAdminPayments(status: string, search: string) {
  return useQuery({
    queryKey: qk.admin.payments(status, search),
    queryFn: () => rpc('admin_list_payments', { p_status: status, p_search: search || null, p_limit: 50 }),
    placeholderData: keepPreviousData,
    refetchInterval: status === 'submitted' ? 30_000 : false,
  });
}
export function useAdminReports(status: string) {
  return useQuery({ queryKey: qk.admin.reports(status), queryFn: () => rpc('admin_list_reports', { p_status: status, p_limit: 50 }) });
}
export function useAdminUsers(search: string, filter: string) {
  return useQuery({
    queryKey: qk.admin.users(search, filter),
    queryFn: () => rpc('admin_list_users', { p_search: search || null, p_filter: filter, p_limit: 50 }),
    placeholderData: keepPreviousData,
  });
}
export function useAdminUser(publicId: string | null) {
  return useQuery({
    queryKey: qk.admin.user(publicId ?? ''),
    queryFn: () => rpc('admin_get_user', { p_public_id: publicId ?? '' }),
    enabled: Boolean(publicId),
  });
}
export function useAdminListings(status: string, search: string) {
  return useQuery({
    queryKey: qk.admin.listings(status, search),
    queryFn: () => rpc('admin_list_listings', { p_status: status, p_search: search || null, p_limit: 50 }),
    placeholderData: keepPreviousData,
  });
}
export function useAdminSettings() {
  return useQuery({ queryKey: qk.admin.settings, queryFn: () => rpc('admin_get_settings', {}) });
}
export function useAuditLog(action: string, target: string) {
  return useQuery({
    queryKey: qk.admin.audit(action, target),
    queryFn: () => rpc('admin_audit_log', { p_action: action || null, p_target_type: target || null, p_limit: 100 }),
    placeholderData: keepPreviousData,
  });
}

function useAdminMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.admin.all });
      void qc.invalidateQueries({ queryKey: ['home'] });
      void qc.invalidateQueries({ queryKey: ['search'] });
      void qc.invalidateQueries({ queryKey: ['listing'] });
    },
  });
}

export const useModerate = () =>
  useAdminMutation((v: { id: string; approve: boolean; reason?: ListingRejectReason; note?: string }) =>
    rpc('moderate_listing', { p_id: v.id, p_approve: v.approve, p_reason: v.reason ?? null, p_note: v.note ?? '' }),
  );
export const useRemoveListing = () =>
  useAdminMutation((v: { id: string; reason: ListingRejectReason; note?: string }) =>
    rpc('admin_remove_listing', { p_id: v.id, p_reason: v.reason, p_note: v.note ?? '' }),
  );
export const useConfirmPayment = () => useAdminMutation((id: string) => rpc('admin_confirm_payment', { p_id: id }));
export const useRejectPayment = () =>
  useAdminMutation((v: { id: string; reason: PaymentRejectReason; note?: string }) =>
    rpc('admin_reject_payment', { p_id: v.id, p_reason: v.reason, p_note: v.note ?? '' }),
  );
export const useRefundPayment = () =>
  useAdminMutation((v: { id: string; note?: string }) => rpc('admin_refund_payment', { p_id: v.id, p_note: v.note ?? '' }));
export const useResolveReport = () =>
  useAdminMutation((v: { id: string; action: 'dismiss' | 'remove_listing' | 'ban_user'; note?: string }) =>
    rpc('resolve_report', { p_id: v.id, p_action: v.action, p_note: v.note ?? '' }),
  );
export const useSetBan = () =>
  useAdminMutation((v: { publicId: string; banned: boolean; reason?: string }) =>
    rpc('admin_set_ban', { p_public_id: v.publicId, p_banned: v.banned, p_reason: v.reason ?? '' }),
  );
export const useSetRole = () =>
  useAdminMutation((v: { publicId: string; role: Role }) => rpc('admin_set_role', { p_public_id: v.publicId, p_role: v.role }));
export const useSetVerified = () =>
  useAdminMutation((v: { publicId: string; verified: boolean }) =>
    rpc('admin_set_verified', { p_public_id: v.publicId, p_verified: v.verified }),
  );
export const useUpdateSettings = () =>
  useAdminMutation((input: Partial<Omit<AdminSettings, 'updated_at' | 'updated_by'>>) =>
    rpc('admin_update_settings', { p_input: input }),
  );

export async function paymentProofUrl(paymentId: string): Promise<string | null> {
  const res = await callFunction('storage', { action: 'view-proof', payment_id: paymentId });
  return res.url ?? null;
}
