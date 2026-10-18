import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { SettingsInput } from '../../lib/api/types';

export function useSettings() {
  return useQuery({ queryKey: qk.settings, queryFn: () => rpc('get_settings', {}) });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettingsInput) => rpc('update_settings', { p_input: input }),
    onSuccess: (settings) => {
      qc.setQueryData(qk.settings, settings);
      // get_me carries the settings every screen reads (shop name, staff permissions).
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
