import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '../../app/queryClient';
import { rpc } from '../../lib/api/client';
import type { Role } from '../../lib/api/types';

export function useTeam() {
  return useQuery({ queryKey: qk.team, queryFn: () => rpc('list_team', {}) });
}

export function useSetMemberRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ publicId, role }: { publicId: string; role: Role }) => rpc('set_member_role', { p_public_id: publicId, p_role: role }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.team });
      void qc.invalidateQueries({ queryKey: qk.me });
    },
  });
}
