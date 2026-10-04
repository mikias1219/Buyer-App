import { FlaskConical, Send, WifiOff } from 'lucide-react';
import { Suspense, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorState, GridSkeleton, Toaster } from '../components/ui';
import { useMe } from '../features/auth/hooks';
import { useSession } from '../features/auth/session';
import i18n from '../lib/i18n';
import { getStartParam, startParamToPath } from '../lib/telegram';
import { useOnline } from '../lib/useOnline';
import { BottomNav } from './BottomNav';
import { ErrorBoundary } from './ErrorBoundary';
import { useTelegramBackButton } from './telegramHooks';

const HIDE_NAV = [/^\/sell\/.+/, /^\/pay\//, /^\/admin/, /^\/verify-phone/, /^\/mine\/[^/]+\/edit/, /^\/ui/];

export function AppShell() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const online = useOnline();
  const session = useSession();
  const me = useMe();
  useTelegramBackButton();

  // Deep links (startapp=p_<id> | c_<category> | s_<seller>) once per launch.
  const handledDeepLink = useRef(false);
  useEffect(() => {
    if (handledDeepLink.current || session.status === 'booting') return;
    handledDeepLink.current = true;
    const path = startParamToPath(getStartParam());
    if (path && location.pathname === '/') navigate(path);
  }, [session.status, location.pathname, navigate]);

  // The profile language (server) wins once it is known.
  const serverLang = me.data?.language;
  useEffect(() => {
    if (serverLang && serverLang !== i18n.language) void i18n.changeLanguage(serverLang);
  }, [serverLang]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  const showNav = !HIDE_NAV.some((re) => re.test(location.pathname));

  return (
    <div className="min-h-full" style={{ paddingTop: 'var(--safe-top)' }}>
      {session.mock ? (
        <div className="flex items-center justify-center gap-1.5 bg-accent-soft px-4 py-1.5 text-xs font-semibold text-accent-ink">
          <FlaskConical aria-hidden className="size-3.5" />
          {t('shell.mockBanner')}
        </div>
      ) : null}
      {session.status === 'guest' ? (
        <div className="flex items-center justify-center gap-1.5 bg-brand-soft px-4 py-1.5 text-xs font-semibold text-brand">
          <Send aria-hidden className="size-3.5" />
          {t('shell.guestBanner')}
        </div>
      ) : null}
      {!online ? (
        <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-1.5 bg-ink px-4 py-2 text-xs font-semibold text-surface">
          <WifiOff aria-hidden className="size-4" />
          {t('shell.offline')}
        </div>
      ) : null}
      <main className={`mx-auto w-full max-w-lg px-4 pt-4 ${showNav ? 'pb-28' : 'pb-6'}`}>
        <ErrorBoundary key={location.pathname} fallback={(reset) => <ErrorState error={new Error('render')} onRetry={reset} />}>
          <Suspense fallback={<GridSkeleton count={4} />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
      {showNav ? <BottomNav /> : null}
      <Toaster />
    </div>
  );
}
