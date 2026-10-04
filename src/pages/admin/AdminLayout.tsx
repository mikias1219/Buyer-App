import { NavLink, Outlet } from 'react-router-dom';
import { RequireAdmin } from '../../components/RequireAdmin';
import { PageHeader, SectionCard } from '../../components/ui';

const LINKS = [
  { to: '/admin', label: 'Home', end: true },
  { to: '/admin/payments', label: 'Payments' },
  { to: '/admin/products', label: 'Listings' },
  { to: '/admin/users', label: 'Users' },
  { to: '/admin/finance', label: 'Money' },
  { to: '/admin/settings', label: 'Settings' },
];

export function AdminLayout() {
  return (
    <RequireAdmin>
      <div className="space-y-3.5">
        <PageHeader
          title="Admin dashboard"
          subtitle="Confirm fees · manage listings · track income"
        />

        <SectionCard className="!p-1.5">
          <nav className="flex gap-1 overflow-x-auto">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  [
                    'shrink-0 rounded-xl px-3 py-2 text-[12px] font-semibold transition',
                    isActive
                      ? 'bg-[var(--tg-theme-button-color,#2481cc)] text-white shadow-sm'
                      : 'text-[var(--tg-theme-hint-color,#8e8e93)]',
                  ].join(' ')
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </SectionCard>

        <Outlet />
      </div>
    </RequireAdmin>
  );
}
