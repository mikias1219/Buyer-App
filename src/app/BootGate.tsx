import { Clock, Send, Settings2, ShoppingBag } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, EmptyState, ErrorState, Spinner } from '../components/ui';
import { retrySession, startSession, useSession } from '../features/auth/session';
import { restoreLanguage } from '../lib/i18n';
import { getWebApp } from '../lib/telegram';

/** Starts the session and renders full-screen states for the cases where the app cannot run. */
export function BootGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const session = useSession();

  useEffect(() => {
    void startSession();
    void restoreLanguage();
  }, []);

  if (session.status === 'booting') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-brand" role="status" aria-label={t('common.loading')}>
        <span className="flex size-16 items-center justify-center rounded-2xl bg-brand text-brand-contrast shadow-lg">
          <ShoppingBag aria-hidden className="size-8" />
        </span>
        <Spinner />
      </div>
    );
  }
  if (session.status === 'unconfigured') {
    return <FullScreen><EmptyState icon={Settings2} title={t('boot.unconfiguredTitle')} description={t('boot.unconfiguredBody')} /></FullScreen>;
  }
  if (session.status === 'expired') {
    return (
      <FullScreen>
        <EmptyState
          icon={Clock}
          title={t('boot.expiredTitle')}
          description={t('boot.expiredBody')}
          action={
            <Button block icon={Send} onClick={() => getWebApp()?.close()}>
              {t('boot.reopen')}
            </Button>
          }
        />
      </FullScreen>
    );
  }
  if (session.status === 'error') {
    return (
      <FullScreen>
        <ErrorState error={session.error} onRetry={() => void retrySession()} />
      </FullScreen>
    );
  }
  return <>{children}</>;
}

function FullScreen({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-center justify-center p-4">{children}</div>;
}
