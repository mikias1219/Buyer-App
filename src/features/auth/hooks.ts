import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { callFunction, rpc } from '../../lib/api/client';
import type { Language, Me } from '../../lib/api/types';
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

export function useSettings() {
  const { status } = useSession();
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => rpc('get_public_settings', {}),
    enabled: status !== 'booting' && status !== 'unconfigured',
    staleTime: 5 * 60_000,
  });
}

/** Role flags always come from the server (`get_me`), never from client state. */
export function usePermissions(me: Me | undefined) {
  return {
    isSignedIn: Boolean(me),
    isStaff: me?.role === 'moderator' || me?.role === 'admin',
    isAdmin: me?.role === 'admin',
    isBanned: Boolean(me?.is_banned),
    canContact: Boolean(me && me.phone_verified && !me.is_banned),
    canSell: Boolean(me && !me.is_banned),
  };
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { city?: string; language?: Language }) => rpc('update_my_profile', { p_input: input }),
    onSuccess: (me) => {
      qc.setQueryData(qk.me, me);
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useChangeLanguage() {
  const update = useUpdateProfile();
  const { status } = useSession();
  return (lang: Language) => {
    setLanguage(lang);
    if (status === 'authenticated') update.mutate({ language: lang });
  };
}

export function useVerifyPhone() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (response: string) => callFunction('verify-phone', { response }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.me }),
  });
}
