import { Lock } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '../components/ui';
import { usePermissions } from '../features/auth/hooks';

/**
 * Route guards are UX only. Every rule is enforced again by the database RPCs.
 * Membership (owner/staff) is already checked by AppShell before any route renders.
 */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { isOwner } = usePermissions();
  if (!isOwner) return <EmptyState icon={Lock} title={t('guards.ownerOnlyTitle')} description={t('guards.ownerOnlyBody')} />;
  return <>{children}</>;
}
