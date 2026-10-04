import { Lock, Send, ShieldAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router-dom';
import { EmptyState, ErrorState, GridSkeleton, Notice } from '../components/ui';
import { useMe, usePermissions } from '../features/auth/hooks';
import { useSession } from '../features/auth/session';

/**
 * Route guards are UX only. Every rule is enforced again by the database (RLS + RPC checks).
 */
export function RequireAccount({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();
  const me = useMe();
  if (session.status === 'guest') {
    return <EmptyState icon={Send} title={t('guards.openInTelegramTitle')} description={t('guards.openInTelegramBody')} />;
  }
  if (me.isPending) return <GridSkeleton count={2} />;
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  return <>{children}</>;
}

export function RequireSeller({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const location = useLocation();
  const me = useMe();
  const perms = usePermissions(me.data);
  return (
    <RequireAccount>
      {perms.isBanned ? (
        <Notice tone="danger" icon={ShieldAlert} title={t('guards.bannedTitle')}>
          {me.data?.ban_reason || t('guards.bannedBody')}
        </Notice>
      ) : me.data && !me.data.phone_verified ? (
        <Navigate to={`/verify-phone?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
      ) : (
        children
      )}
    </RequireAccount>
  );
}

export function RequireStaff({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { t } = useTranslation();
  const me = useMe();
  const perms = usePermissions(me.data);
  return (
    <RequireAccount>
      {(adminOnly ? perms.isAdmin : perms.isStaff) ? (
        children
      ) : (
        <EmptyState icon={Lock} title={t('guards.noAccessTitle')} description={t('guards.noAccessBody')} />
      )}
    </RequireAccount>
  );
}
