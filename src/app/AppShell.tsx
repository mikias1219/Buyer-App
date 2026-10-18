import { FlaskConical, WifiOff } from 'lucide-react';
import { Suspense, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation } from 'react-router-dom';
import { ErrorState, PageSkeleton, Toaster } from '../components/ui';
import { useMe, usePermissions } from '../features/auth/hooks';
import { useSession } from '../features/auth/session';
import i18n from '../lib/i18n';
import { useOnline } from '../lib/useOnline';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from './ErrorBoundary';
import { NoAccess } from './NoAccess';
import { useTelegramBackButton } from './telegramHooks';

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const online = useOnline();
  const session = useSession();
  const me = useMe();
  const { isMember } = usePermissions();
  useTelegramBackButton();

  // The profile language (server) wins once it is known.
  const serverLang = me.data?.language;
  useEffect(() => {
    if (serverLang && serverLang !== i18n.language) void i18n.changeLanguage(serverLang);
  }, [serverLang]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const devGallery = import.meta.env.DEV && location.pathname === '/ui';
  let content;
  if (me.isPending) content = <PageSkeleton />;
  else if (me.isError) content = <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  else if (!isMember && !devGallery) content = <NoAccess />;
  else
    content = (
      <ErrorBoundary key={location.pathname} fallback={(reset) => <ErrorState error={new Error('render')} onRetry={reset} />}>
        <Suspense fallback={<PageSkeleton />}>
          <Outlet />
        </Suspense>
      </ErrorBoundary>
    );
  const showNav = isMember;

  return (
    <div className="min-h-full" style={{ paddingTop: 'var(--safe-top)' }}>
      {session.mock ? (
        <div className="flex items-center justify-center gap-1.5 bg-accent-soft px-4 py-1.5 text-xs font-semibold text-accent-ink">
          <FlaskConical aria-hidden className="size-3.5" />
          {t('shell.mockBanner')}
        </div>
      ) : null}
      {!online ? (
        <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-1.5 bg-ink px-4 py-2 text-xs font-semibold text-surface">
          <WifiOff aria-hidden className="size-4" />
          {t('shell.offline')}
        </div>
      ) : null}
      <main className={`mx-auto w-full max-w-lg px-4 pt-4 ${showNav ? 'pb-28' : 'pb-6'}`}>{content}</main>
      {showNav ? <BottomNav /> : null}
      <Toaster />
    </div>
  );
}
