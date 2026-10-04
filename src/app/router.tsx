import { lazy } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { RequireAccount, RequireSeller, RequireStaff } from './guards';

// Buyer screens load eagerly-ish (small); seller and admin areas are separate chunks.
const HomePage = lazy(() => import('../features/listings/pages/HomePage'));
const SearchPage = lazy(() => import('../features/listings/pages/SearchPage'));
const ListingPage = lazy(() => import('../features/listings/pages/ListingPage'));
const SellerPage = lazy(() => import('../features/listings/pages/SellerPage'));
const FavoritesPage = lazy(() => import('../features/favorites/FavoritesPage'));
const MyListingsPage = lazy(() => import('../features/listings/pages/MyListingsPage'));
const SellStartPage = lazy(() => import('../features/sell/pages/SellStartPage'));
const SellWizardPage = lazy(() => import('../features/sell/pages/SellWizardPage'));
const SellDonePage = lazy(() => import('../features/sell/pages/SellDonePage'));
const PayPage = lazy(() => import('../features/payments/PayPage'));
const ProfilePage = lazy(() => import('../features/profile/ProfilePage'));
const VerifyPhonePage = lazy(() => import('../features/profile/VerifyPhonePage'));
const AdminRoutes = lazy(() => import('../features/admin/AdminRoutes'));
const UiGallery = import.meta.env.DEV ? lazy(() => import('../components/ui/UiGallery')) : null;

export const router = createHashRouter([
  {
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'search', element: <SearchPage /> },
      { path: 'p/:id', element: <ListingPage /> },
      { path: 'seller/:id', element: <SellerPage /> },
      { path: 'favorites', element: <RequireAccount><FavoritesPage /></RequireAccount> },
      { path: 'mine', element: <RequireAccount><MyListingsPage /></RequireAccount> },
      { path: 'mine/:id/edit/:step?', element: <RequireSeller><SellWizardPage mode="edit" /></RequireSeller> },
      { path: 'sell', element: <RequireSeller><SellStartPage /></RequireSeller> },
      { path: 'sell/done/:id', element: <RequireSeller><SellDonePage /></RequireSeller> },
      { path: 'sell/:id/:step?', element: <RequireSeller><SellWizardPage mode="create" /></RequireSeller> },
      { path: 'pay/:paymentId', element: <RequireAccount><PayPage /></RequireAccount> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'verify-phone', element: <RequireAccount><VerifyPhonePage /></RequireAccount> },
      { path: 'admin/*', element: <RequireStaff><AdminRoutes /></RequireStaff> },
      ...(UiGallery ? [{ path: 'ui', element: <UiGallery /> }] : []),
      // Old MVP routes (bookmarks / bot buttons).
      { path: 'product/:id', element: <LegacyProductRedirect /> },
      { path: 'my-listings', element: <Navigate to="/mine" replace /> },
      { path: 'add', element: <Navigate to="/sell" replace /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);

function LegacyProductRedirect() {
  const id = window.location.hash.split('/').pop() ?? '';
  return <Navigate to={`/p/${id}`} replace />;
}
