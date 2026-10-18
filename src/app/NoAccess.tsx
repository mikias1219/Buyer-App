import { ShieldAlert, UserRoundX } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Card, EmptyState } from '../components/ui';
import { useMe } from '../features/auth/hooks';
import { useSession } from '../features/auth/session';

const MockUserSwitcher =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? lazy(() => import('../lib/api/mock/MockUserSwitcher')) : null;

/** Signed in through Telegram, but not (or no longer) a member of the shop (SPEC A2 `user`). */
export function NoAccess() {
  const { t } = useTranslation();
  const me = useMe().data;
  const session = useSession();
  const name = [me?.first_name, me?.last_name].filter(Boolean).join(' ') || me?.username || '';
  return (
    <div className="mx-auto max-w-sm space-y-4 py-6">
      {me?.is_banned ? (
        <EmptyState icon={ShieldAlert} title={t('noAccess.bannedTitle')} description={t('noAccess.bannedBody')} />
      ) : (
        <EmptyState
          icon={UserRoundX}
          title={t('noAccess.title', { shop: me?.settings.shop_name || t('app.name') })}
          description={t('noAccess.body')}
        />
      )}
      {me ? (
        <Card className="flex items-center gap-3">
          <Avatar name={name} url={me.photo_url} />
          <div className="min-w-0">
            <p className="truncate font-semibold">{name}</p>
            {me.username ? <p className="truncate text-sm text-hint">@{me.username}</p> : null}
          </div>
        </Card>
      ) : null}
      {session.mock && MockUserSwitcher ? (
        <Suspense fallback={null}>
          <MockUserSwitcher />
        </Suspense>
      ) : null}
    </div>
  );
}
