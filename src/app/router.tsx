import { lazy } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { usePermissions } from '../features/auth/hooks';
import { AppShell } from './AppShell';
import { RequireOwner } from './guards';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ProductsPage = lazy(() => import('../features/products/ProductsPage'));
const SellPage = lazy(() => import('../features/sell/SellPage'));
const SalesPage = lazy(() => import('../features/sales/SalesPage'));
const MorePage = lazy(() => import('../features/more/MorePage'));
const TeamPage = lazy(() => import('../features/team/TeamPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const UiGallery = import.meta.env.DEV ? lazy(() => import('../components/ui/UiGallery')) : null;

/** Owners land on the dashboard, staff on the till. */
function RoleHome() {
  const { isOwner } = usePermissions();
  return <Navigate to={isOwner ? '/dashboard' : '/sell'} replace />;
}

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'dashboard', element: <RequireOwner><DashboardPage /></RequireOwner> },
      { path: 'products', element: <ProductsPage /> },
      { path: 'sell', element: <SellPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'more/team', element: <RequireOwner><TeamPage /></RequireOwner> },
      { path: 'more/settings', element: <RequireOwner><SettingsPage /></RequireOwner> },
      ...(UiGallery ? [{ path: 'ui', element: <UiGallery /> }] : []),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
