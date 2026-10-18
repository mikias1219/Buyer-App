import { lazy, type ReactNode } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { usePermissions } from '../features/auth/hooks';
import { AppShell } from './AppShell';
import { RequireOwner } from './guards';

const DashboardPage = lazy(() => import('../features/dashboard/DashboardPage'));
const ProductsPage = lazy(() => import('../features/products/pages/ProductsPage'));
const ProductDetailPage = lazy(() => import('../features/products/pages/ProductDetailPage'));
const ProductFormPage = lazy(() => import('../features/products/pages/ProductFormPage'));
const SellPage = lazy(() => import('../features/sell/SellPage'));
const SalesPage = lazy(() => import('../features/sales/SalesPage'));
const SaleDetailPage = lazy(() => import('../features/sales/SaleDetailPage'));
const MorePage = lazy(() => import('../features/more/MorePage'));
const ExpensesPage = lazy(() => import('../features/expenses/ExpensesPage'));
const ReportsPage = lazy(() => import('../features/reports/ReportsPage'));
const CustomersPage = lazy(() => import('../features/customers/CustomersPage'));
const CustomerDetailPage = lazy(() => import('../features/customers/CustomerDetailPage'));
const CategoriesPage = lazy(() => import('../features/categories/CategoriesPage'));
const ImportPage = lazy(() => import('../features/import/ImportPage'));
const TeamPage = lazy(() => import('../features/team/TeamPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const UiGallery = import.meta.env.DEV ? lazy(() => import('../components/ui/UiGallery')) : null;

/** Owners land on the dashboard, staff on the till. */
function RoleHome() {
  const { isOwner } = usePermissions();
  return <Navigate to={isOwner ? '/dashboard' : '/sell'} replace />;
}

const owner = (el: ReactNode) => <RequireOwner>{el}</RequireOwner>;

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <RoleHome /> },
      { path: 'dashboard', element: owner(<DashboardPage />) },
      { path: 'products', element: <ProductsPage /> },
      { path: 'products/new', element: owner(<ProductFormPage />) },
      { path: 'products/:id', element: <ProductDetailPage /> },
      { path: 'products/:id/edit', element: owner(<ProductFormPage />) },
      { path: 'sell', element: <SellPage /> },
      { path: 'sales', element: <SalesPage /> },
      { path: 'sales/:id', element: <SaleDetailPage /> },
      { path: 'more', element: <MorePage /> },
      { path: 'more/expenses', element: owner(<ExpensesPage />) },
      { path: 'more/reports', element: owner(<ReportsPage />) },
      { path: 'more/customers', element: owner(<CustomersPage />) },
      { path: 'more/customers/:id', element: owner(<CustomerDetailPage />) },
      { path: 'more/categories', element: owner(<CategoriesPage />) },
      { path: 'more/import', element: owner(<ImportPage />) },
      { path: 'more/team', element: owner(<TeamPage />) },
      { path: 'more/settings', element: owner(<SettingsPage />) },
      ...(UiGallery ? [{ path: 'ui', element: <UiGallery /> }] : []),
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
