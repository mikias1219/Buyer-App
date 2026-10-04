import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';
import { useTelegramContext } from '../context/TelegramContext';

export function Layout() {
  const { isReady, colorScheme } = useTelegramContext();

  if (!isReady) {
    return (
      <div className="flex min-h-full items-center justify-center bg-[var(--tg-theme-bg-color,#efeff4)]">
        <div className="h-8 w-8 animate-pulse rounded-full bg-[var(--tg-theme-button-color,#2481cc)]/40" />
      </div>
    );
  }

  return (
    <div
      data-theme={colorScheme}
      className="flex min-h-full flex-col bg-[var(--tg-theme-bg-color,#efeff4)] text-[var(--tg-theme-text-color,#000)]"
    >
      <main className="mx-auto w-full max-w-lg flex-1 px-3.5 pb-28 pt-4">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
