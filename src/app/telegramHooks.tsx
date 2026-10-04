import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/ui';
import { isInTelegram, showBackButton, showMainButton } from '../lib/telegram';

/** Telegram BackButton on every non-root screen; falls back to `fallback` when there is no history. */
export function useTelegramBackButton(fallback = '/') {
  const navigate = useNavigate();
  const location = useLocation();
  const isRoot = ['/', '/favorites', '/mine', '/profile', '/search'].includes(location.pathname);
  useEffect(() => {
    if (isRoot) return;
    return showBackButton(() => {
      if (location.key !== 'default') navigate(-1);
      else navigate(fallback, { replace: true });
    });
  }, [isRoot, location.key, navigate, fallback]);
}

/**
 * Primary action of a screen. Inside Telegram it drives the native MainButton; in a browser
 * (and in e2e tests) it renders a sticky button with the same behaviour.
 */
export function PrimaryAction({
  text,
  onClick,
  disabled,
  loading,
}: {
  text: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const native = isInTelegram();
  const handler = useRef(onClick);
  useEffect(() => {
    handler.current = onClick;
  }, [onClick]);

  useEffect(() => {
    if (!native) return;
    return showMainButton({ text, onClick: () => handler.current(), disabled: Boolean(disabled), loading: Boolean(loading), color: '#0F766E', textColor: '#FFFFFF' });
  }, [native, text, disabled, loading]);

  if (native) return <div aria-hidden className="h-4" />;
  return (
    <>
      <div aria-hidden className="h-20" />
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 px-4 pt-3 backdrop-blur"
        style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
      >
        <div className="mx-auto max-w-lg">
          <Button block size="lg" onClick={onClick} disabled={disabled} loading={loading}>
            {text}
          </Button>
        </div>
      </div>
    </>
  );
}
