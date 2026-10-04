import { lazy } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { cn } from '../../components/ui';
import { useMe, usePermissions } from '../auth/hooks';
import { useAdminDashboard } from './api';

const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const QueuePage = lazy(() => import('./pages/QueuePage'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const UsersPage = lazy(() => import('./pages/UsersPage'));
const ListingsPage = lazy(() => import('./pages/ListingsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const AuditPage = lazy(() => import('./pages/AuditPage'));

/** Admin area. Moderators see moderation sections only; the server enforces this independently. */
export default function AdminRoutes() {
  const { t } = useTranslation();
  const me = useMe();
  const { isAdmin } = usePermissions(me.data);
  const dash = useAdminDashboard();
  const d = dash.data;

  const tabs = [
    { to: '/admin', label: t('admin.nav.dashboard'), end: true },
    { to: '/admin/queue', label: t('admin.nav.queue'), count: d?.in_review },
    ...(isAdmin ? [{ to: '/admin/payments', label: t('admin.nav.payments'), count: d?.payments_waiting }] : []),
    { to: '/admin/reports', label: t('admin.nav.reports'), count: d?.open_reports },
    { to: '/admin/listings', label: t('admin.nav.listings') },
    ...(isAdmin
      ? [
          { to: '/admin/users', label: t('admin.nav.users') },
          { to: '/admin/settings', label: t('admin.nav.settings') },
          { to: '/admin/audit', label: t('admin.nav.audit') },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <nav aria-label={t('admin.nav.label')} className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold',
                isActive ? 'bg-ink text-surface' : 'bg-surface text-hint shadow-card',
              )
            }
          >
            {tab.label}
            {tab.count ? <span className="tabular rounded-full bg-danger px-1.5 text-xs text-white">{tab.count}</span> : null}
          </NavLink>
        ))}
      </nav>
      <Routes>
        <Route index element={<DashboardPage />} />
        <Route path="queue" element={<QueuePage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="listings" element={<ListingsPage />} />
        {isAdmin ? (
          <>
            <Route path="payments" element={<PaymentsPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="audit" element={<AuditPage />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Routes>
    </div>
  );
}
