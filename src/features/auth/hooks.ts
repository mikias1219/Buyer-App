import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { Language, Me, Role } from '../../lib/api/types';
import { setLanguage } from '../../lib/i18n';
import { useSession } from './session';

export function useMe() {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.me,
    queryFn: () => rpc('get_me', {}),
    enabled: status === 'authenticated',
    staleTime: 60_000,
  });
}

export interface Permissions {
  role: Role | null;
  isOwner: boolean;
  isStaff: boolean;
  /** owner or staff */
  isMember: boolean;
  isBanned: boolean;
  /** Cost, margin and profit are owner-only (SPEC A2). */
  canSeeCost: boolean;
  canRestock: boolean;
}

/**
 * Role flags always come from the server (`get_me`), never from client state. UX only: every
 * rule is enforced again by the RPCs.
 */
export function permissionsFor(me: Me | undefined): Permissions {
  const active = Boolean(me && !me.is_banned);
  const role = me?.role ?? null;
  const isOwner = active && role === 'owner';
  const isStaff = active && role === 'staff';
  return {
    role,
    isOwner,
    isStaff,
    isMember: isOwner || isStaff,
    isBanned: Boolean(me?.is_banned),
    canSeeCost: isOwner,
    canRestock: isOwner || (isStaff && Boolean(me?.settings.staff_can_restock)),
  };
}

export function usePermissions(): Permissions {
  return permissionsFor(useMe().data);
}

/** Shop settings for members (from get_me; refreshed when settings change). */
export function useShopSettings() {
  const me = useMe();
  return me.data?.settings;
}

export function useChangeLanguage() {
  const qc = useQueryClient();
  const { status } = useSession();
  const update = useMutation({
    mutationFn: (language: Language) => rpc('update_my_profile', { p_input: { language } }),
    onSuccess: (me) => qc.setQueryData(qk.me, me),
  });
  return (lang: Language) => {
    setLanguage(lang);
    if (status === 'authenticated') update.mutate(lang);
  };
}
