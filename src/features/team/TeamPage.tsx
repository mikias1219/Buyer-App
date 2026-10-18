import { Crown, UserRoundCheck, UserRoundMinus, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Avatar,
  Badge,
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  ListGroup,
  ListRow,
  ListSkeleton,
  PageHeader,
  Section,
  toast,
} from '../../components/ui';
import type { Member, Role } from '../../lib/api/types';
import { formatRelative } from '../../lib/format';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { showConfirm } from '../../lib/telegram';
import { useSetMemberRole, useTeam } from './api';

export default function TeamPage() {
  const { t, i18n } = useTranslation();
  const team = useTeam();
  const setRole = useSetMemberRole();
  const errorMessage = useErrorMessage();
  const [selected, setSelected] = useState<Member | null>(null);

  const change = async (m: Member, role: Role) => {
    const confirmKey = role === 'owner' ? 'team.confirmOwner' : role === 'user' ? 'team.confirmRemove' : null;
    if (confirmKey && !(await showConfirm(t(confirmKey, { name: m.name })))) return;
    setRole.mutate(
      { publicId: m.public_id, role },
      {
        onSuccess: () => {
          toast.success(t('team.updated', { name: m.name }));
          setSelected(null);
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader title={t('team.title')} subtitle={t('team.subtitle')} />
      {team.isPending ? (
        <ListSkeleton rows={3} />
      ) : team.isError ? (
        <ErrorState error={team.error} onRetry={() => void team.refetch()} />
      ) : (
        <>
          <Section title={t('team.members')}>
            <ListGroup>
              {team.data.members.map((m) => (
                <ListRow
                  key={m.public_id}
                  leading={<Avatar name={m.name} url={m.photo_url} />}
                  title={m.public_id === team.data.me ? t('team.you', { name: m.name }) : m.name}
                  subtitle={m.username ? `@${m.username}` : undefined}
                  meta={<Badge tone={m.role === 'owner' ? 'brand' : 'neutral'}>{t(`role.${m.role}`)}</Badge>}
                  onClick={() => setSelected(m)}
                />
              ))}
            </ListGroup>
          </Section>

          <Section title={t('team.requests')}>
            {team.data.requests.length === 0 ? (
              <EmptyState icon={UsersRound} title={t('team.noRequestsTitle')} description={t('team.noRequestsBody')} className="py-6" />
            ) : (
              <ListGroup>
                {team.data.requests.map((m) => (
                  <ListRow
                    key={m.public_id}
                    leading={<Avatar name={m.name} url={m.photo_url} />}
                    title={m.name}
                    subtitle={t('team.seen', { when: formatRelative(m.last_seen_at, i18n.language) })}
                    trailing={
                      <Button size="sm" icon={UserRoundCheck} loading={setRole.isPending && setRole.variables.publicId === m.public_id} onClick={() => void change(m, 'staff')}>
                        {t('team.grant')}
                      </Button>
                    }
                  />
                ))}
              </ListGroup>
            )}
          </Section>
        </>
      )}

      <BottomSheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.name ?? ''} description={selected ? t(`role.${selected.role}`) : undefined}>
        {selected ? (
          <div className="space-y-2 pt-1">
            {selected.role !== 'staff' ? (
              <Button block variant="secondary" icon={UserRoundCheck} loading={setRole.isPending} onClick={() => void change(selected, 'staff')}>
                {t('team.makeStaff')}
              </Button>
            ) : null}
            {selected.role !== 'owner' ? (
              <Button block variant="secondary" icon={Crown} loading={setRole.isPending} onClick={() => void change(selected, 'owner')}>
                {t('team.makeOwner')}
              </Button>
            ) : null}
            <Button block variant="danger" icon={UserRoundMinus} loading={setRole.isPending} onClick={() => void change(selected, 'user')}>
              {t('team.remove')}
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </div>
  );
}
