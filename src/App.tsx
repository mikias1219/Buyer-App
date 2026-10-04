import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { AuthProvider } from './context/AuthContext';
import { ProductsProvider } from './context/ProductsContext';
import { TelegramProvider } from './context/TelegramContext';
import { AddItem } from './pages/AddItem';
import { Home } from './pages/Home';
import { MyListings } from './pages/MyListings';
import { Onboarding } from './pages/Onboarding';
import { PayListingFee } from './pages/PayListingFee';
import { ProductDetail } from './pages/ProductDetail';
import { Profile } from './pages/Profile';
import { AdminFinance } from './pages/admin/AdminFinance';
import { AdminLayout } from './pages/admin/AdminLayout';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminPayments } from './pages/admin/AdminPayments';
import { AdminProducts } from './pages/admin/AdminProducts';
import { AdminSettings } from './pages/admin/AdminSettings';
import { AdminUsers } from './pages/admin/AdminUsers';

export default function App() {
  return (
    <HashRouter>
      <TelegramProvider>
        <AuthProvider>
          <ProductsProvider>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<Home />} />
                <Route path="add" element={<AddItem />} />
                <Route path="my-listings" element={<MyListings />} />
                <Route path="pay/:id" element={<PayListingFee />} />
                <Route path="product/:id" element={<ProductDetail />} />
                <Route path="profile" element={<Profile />} />
                <Route path="onboarding" element={<Onboarding />} />
                <Route path="admin" element={<AdminLayout />}>
                  <Route index element={<AdminOverview />} />
                  <Route path="payments" element={<AdminPayments />} />
                  <Route path="products" element={<AdminProducts />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="finance" element={<AdminFinance />} />
                  <Route path="settings" element={<AdminSettings />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Route>
            </Routes>
          </ProductsProvider>
        </AuthProvider>
      </TelegramProvider>
    </HashRouter>
  );
}
