import { LayoutDashboard, Menu, Package, Receipt, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '../components/ui';
import { usePermissions } from '../features/auth/hooks';
import { haptic } from '../lib/telegram';

/** SPEC A6: owner → Dashboard · Products · Sell · Sales · More; staff → Sell · Products · My sales · More. */
export function BottomNav() {
  const { t } = useTranslation();
  const { isOwner } = usePermissions();
  const items = isOwner
    ? [
        { to: '/dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
        { to: '/products', label: t('nav.products'), icon: Package },
        { to: '/sell', label: t('nav.sell'), icon: ShoppingCart, center: true },
        { to: '/sales', label: t('nav.sales'), icon: Receipt },
        { to: '/more', label: t('nav.more'), icon: Menu },
      ]
    : [
        { to: '/products', label: t('nav.products'), icon: Package },
        { to: '/sell', label: t('nav.sell'), icon: ShoppingCart, center: true },
        { to: '/sales', label: t('nav.mySales'), icon: Receipt },
        { to: '/more', label: t('nav.more'), icon: Menu },
      ];
  return (
    <nav
      aria-label={t('nav.label')}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <ul className="mx-auto flex max-w-lg items-end justify-around px-2">
        {items.map(({ to, label, icon: Icon, center }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
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
