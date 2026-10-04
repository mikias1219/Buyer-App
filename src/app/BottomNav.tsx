import { Heart, LayoutGrid, Plus, Store, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '../components/ui';
import { haptic } from '../lib/telegram';

export function BottomNav() {
  const { t } = useTranslation();
  const items = [
    { to: '/', label: t('nav.browse'), icon: LayoutGrid, end: true },
    { to: '/favorites', label: t('nav.saved'), icon: Heart },
    { to: '/sell', label: t('nav.sell'), icon: Plus, center: true },
    { to: '/mine', label: t('nav.mine'), icon: Store },
    { to: '/profile', label: t('nav.profile'), icon: UserRound },
  ];
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2">
        {items.map(({ to, label, icon: Icon, end, center }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              onClick={() => haptic.selection()}
              className={({ isActive }) =>
                cn('press flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', isActive ? 'text-brand' : 'text-hint')
              }
            >
              {center ? (
                <span className="-mt-5 mb-0.5 flex size-12 items-center justify-center rounded-full bg-brand text-brand-contrast shadow-lg ring-4 ring-surface">
                  <Icon aria-hidden className="size-6" />
                </span>
              ) : (
                <Icon aria-hidden className="size-6" />
              )}
              <span>{label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
