import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  createPayment,
  submitPaymentReference,
  updatePaymentStatus,
  fetchPayments,
} from '../lib/api/payments';
import { fetchProducts, insertProduct, updateProduct } from '../lib/api/products';
import type { Payment, PaymentStatus } from '../types/payment';
import type { NewProductInput, Product, ProductStatus } from '../types/product';
import { useAuth } from './AuthContext';
import { useTelegramContext } from './TelegramContext';

interface ProductsContextValue {
  products: Product[];
  allProducts: Product[];
  payments: Payment[];
  loading: boolean;
  usingMockData: boolean;
  getProductById: (id: string) => Product | undefined;
  refresh: () => Promise<void>;
  addProduct: (input: NewProductInput) => Promise<Product>;
  submitListingPayment: (productId: string, reference: string) => Promise<boolean>;
  adminSetProductStatus: (productId: string, status: ProductStatus) => Promise<boolean>;
  adminSetPaymentStatus: (
    paymentId: string,
    status: PaymentStatus,
    note?: string,
  ) => Promise<boolean>;
  myProducts: Product[];
}

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { user } = useTelegramContext();
  const { settings, telegramId } = useAuth();
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [usingMockData, setUsingMockData] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [{ products, fromMock }, pays] = await Promise.all([
      fetchProducts({ activeOnly: false }),
      fetchPayments(),
    ]);
    setAllProducts(products);
    setPayments(pays);
    setUsingMockData(fromMock);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy screen, replaced in Phase 2
    void refresh();
  }, [refresh]);

  const products = useMemo(
    () => allProducts.filter((p) => p.status === 'active'),
    [allProducts],
  );

  const username = user?.username;
  const myProducts = useMemo(
    () =>
      allProducts.filter(
        (p) =>
          p.seller_id === telegramId ||
          (username && p.seller_username === username),
      ),
    [allProducts, telegramId, username],
  );

  const getProductById = useCallback(
    (id: string) => allProducts.find((p) => p.id === id),
    [allProducts],
  );

  const addProduct = useCallback(
    async (input: NewProductInput): Promise<Product> => {
      const seller_id = telegramId;
      const seller_username = user?.username || 'unknown_seller';
      const fee = Number(settings.listing_fee_etb) || 0;

      const created = await insertProduct({
        product: {
          ...input,
          city: input.city || '',
          brand: input.brand || '',
        },
        seller_id,
        seller_username,
        listing_fee_etb: fee,
        status: fee > 0 ? 'pending_payment' : 'active',
      });

      if (!created) throw new Error('Failed to create product');

      if (fee > 0) {
        const payment = await createPayment({
          telegram_id: seller_id,
          product_id: created.id,
          amount_etb: fee,
        });
        if (payment) {
          const linked = await updateProduct(created.id, { payment_id: payment.id });
          const finalProduct = linked ?? { ...created, payment_id: payment.id };
          setAllProducts((prev) => [finalProduct, ...prev.filter((p) => p.id !== finalProduct.id)]);
          setPayments((prev) => [payment, ...prev]);
          return finalProduct;
        }
      }

      setAllProducts((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      return created;
    },
    [settings.listing_fee_etb, telegramId, user?.username],
  );

  const submitListingPayment = useCallback(
    async (productId: string, reference: string) => {
      const product = allProducts.find((p) => p.id === productId);
      if (!product?.payment_id) return false;

      const payment = await submitPaymentReference(product.payment_id, reference.trim());
      if (!payment) return false;

      const updated = await updateProduct(productId, { status: 'payment_submitted' });
      if (!updated) return false;

      setPayments((prev) => prev.map((p) => (p.id === payment.id ? payment : p)));
      setAllProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
      return true;
    },
    [allProducts],
  );

  const adminSetProductStatus = useCallback(
    async (productId: string, status: ProductStatus) => {
      const updated = await updateProduct(productId, { status });
      if (!updated) return false;
      setAllProducts((prev) => prev.map((p) => (p.id === productId ? updated : p)));
      return true;
    },
    [],
  );

  const adminSetPaymentStatus = useCallback(
    async (paymentId: string, status: PaymentStatus, note = '') => {
      const payment = await updatePaymentStatus(paymentId, status, note);
      if (!payment) return false;

      setPayments((prev) => prev.map((p) => (p.id === paymentId ? payment : p)));

      if (status === 'confirmed') {
        await adminSetProductStatus(payment.product_id, 'active');
      } else if (status === 'rejected') {
        await adminSetProductStatus(payment.product_id, 'rejected');
      } else if (status === 'refunded') {
        await adminSetProductStatus(payment.product_id, 'hidden');
      }

      return true;
    },
    [adminSetProductStatus],
  );

  const value = useMemo(
    () => ({
      products,
      allProducts,
      payments,
      loading,
      usingMockData,
      getProductById,
      refresh,
      addProduct,
      submitListingPayment,
      adminSetProductStatus,
      adminSetPaymentStatus,
      myProducts,
    }),
    [
      products,
      allProducts,
      payments,
      loading,
      usingMockData,
      getProductById,
      refresh,
      addProduct,
      submitListingPayment,
      adminSetProductStatus,
      adminSetPaymentStatus,
      myProducts,
    ],
  );

  return (
    <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
  );
}

export function useProducts(): ProductsContextValue {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error('useProducts must be used within ProductsProvider');
  return ctx;
}
