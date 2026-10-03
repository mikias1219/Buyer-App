import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/** Redirects to onboarding when phone is missing; blocks banned users. */
export function RequireProfile({ children }: { children: ReactNode }) {
  const { loading, hasPhone, isBanned } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
        Loading account…
      </div>
    );
  }

  if (isBanned) {
    return (
      <div className="rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] p-4 text-center">
        <p className="text-[15px] font-semibold">Account suspended</p>
        <p className="mt-1 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          Contact support if you think this is a mistake.
        </p>
      </div>
    );
  }

  if (!hasPhone) {
    return <Navigate to="/onboarding" replace state={{ from: location.pathname }} />;
  }

  return children;
}
