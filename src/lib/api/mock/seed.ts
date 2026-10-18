/**
 * Demo data for the in-memory mock backend (dev / e2e only). Fictional shop, fictional people.
 */
import type { DebtPaymentMethod, ExpenseCategory, MovementType, PaymentMethod, Role, ShopSettings, Unit } from '../types';

export interface MockUser {
  telegram_id: string;
  public_id: string;
  username: string;
  first_name: string;
  last_name: string;
  role: Role;
  is_banned: boolean;
  language: 'en' | 'am';
  created_at: string;
  last_seen_at: string;
}

export interface MockCategory {
  id: string;
  name: string;
  sort: number;
  archived: boolean;
}

export interface MockProduct {
  id: string;
  name: string;
  category_id: string | null;
  sku: string | null;
  barcode: string | null;
  unit: Unit;
  sell_price: number;
  avg_cost: number;
  stock_qty: number;
  reorder_level: number;
  image_path: string;
  notes: string;
  status: 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface MockMovement {
  id: number;
  product_id: string;
  type: MovementType;
  qty_delta: number;
  unit_cost: number;
  stock_after: number;
  sale_id: string | null;
  supplier: string;
  reason: string;
  actor_id: string | null;
  created_at: string;
}

export interface MockSaleItem {
  id: number;
  product_id: string;
  qty: number;
  unit_price: number;
  unit_cost: number;
  discount: number;
  line_total: number;
  returned_qty: number;
}

export interface MockReturn {
  id: string;
  reason: string;
  refund_amount: number;
  cost_amount: number;
  created_at: string;
  items: Array<{ sale_item_id: number; qty: number; refund: number; cost: number }>;
}

export interface MockSale {
  id: string;
  receipt_no: number;
  client_ref: string;
  sold_at: string;
  cashier_id: string;
  customer_id: string | null;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  total_cost: number;
  status: 'completed' | 'voided';
  void_reason: string;
  voided_at: string | null;
  note: string;
  items: MockSaleItem[];
  returns: MockReturn[];
}

export interface MockExpense {
  id: string;
  spent_on: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface MockCustomer {
  id: string;
  name: string;
  phone: string;
  note: string;
  archived: boolean;
  created_at: string;
}

export interface MockCustomerPayment {
  id: string;
  customer_id: string;
  amount: number;
  method: DebtPaymentMethod;
  note: string;
  created_by: string;
  created_at: string;
}

export interface MockDb {
  settings: Required<ShopSettings>;
  users: MockUser[];
  categories: MockCategory[];
  products: MockProduct[];
  movements: MockMovement[];
  sales: MockSale[];
  expenses: MockExpense[];
  customers: MockCustomer[];
  customerPayments: MockCustomerPayment[];
  seq: { movement: number; saleItem: number; receipt: number };
}

/** Mock identities (also used by tests/e2e/fixtures.ts). */
export const MOCK_USERS = { owner: '9001', staff: '1001', stranger: '1002' } as const;

const iso = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString();
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export function seedDatabase(): MockDb {
  const categories: MockCategory[] = [
    { id: uuid(101), name: 'Phones', sort: 10, archived: false },
    { id: uuid(102), name: 'Accessories', sort: 20, archived: false },
    { id: uuid(103), name: 'Electronics', sort: 30, archived: false },
    { id: uuid(104), name: 'Household', sort: 40, archived: false },
  ];
  const [phones, accessories, electronics, household] = categories.map((c) => c.id) as [string, string, string, string];

  const p = (
    n: number,
    name: string,
    category_id: string,
    unit: Unit,
    sell_price: number,
    avg_cost: number,
    stock_qty: number,
    reorder_level: number,
    sku: string | null = null,
  ): MockProduct => ({
    id: uuid(n),
    name,
    category_id,
    sku,
    barcode: null,
    unit,
    sell_price,
    avg_cost,
    stock_qty,
    reorder_level,
    image_path: '',
    notes: '',
    status: 'active',
    created_at: iso(60 - n % 50),
    updated_at: iso(5),
  });

  const products: MockProduct[] = [
    p(1, 'Tecno Spark 20', phones, 'piece', 9000, 7500, 4, 5, 'TEC-SP20'),
    p(2, 'Samsung Galaxy A15', phones, 'piece', 14500, 12200, 6, 3, 'SAM-A15'),
    p(3, 'Nokia 105', phones, 'piece', 1800, 1350, 0, 4, 'NOK-105'),
    p(4, 'Charger 20W', accessories, 'piece', 450, 280, 25, 8, 'CHG-20'),
    p(5, 'USB-C cable 1m', accessories, 'piece', 200, 95, 40, 10, 'CBL-C1'),
    p(6, 'Phone case', accessories, 'piece', 250, 90, 18, 6),
    p(7, 'Screen protector', accessories, 'piece', 150, 40, 60, 15),
    p(8, 'Earbuds', accessories, 'piece', 900, 550, 7, 5, 'EAR-01'),
    p(9, 'Power bank 10000mAh', electronics, 'piece', 1600, 1150, 9, 4, 'PWB-10K'),
    p(10, 'Extension socket', electronics, 'piece', 650, 420, 3, 4),
    p(11, 'LED bulb 9W', electronics, 'box', 1200, 800, 12, 3),
    p(12, 'Copper wire', electronics, 'metre', 40.5, 25, 180.5, 50),
    p(13, 'Rice', household, 'kg', 120, 95, 48.25, 20),
    p(14, 'Cooking oil', household, 'litre', 210, 175, 30, 10),
    p(15, 'Batteries AA (4)', household, 'pack', 180, 110, 22, 6),
  ];
  const archived = p(16, 'Old radio', electronics, 'piece', 700, 500, 0, 0);
  archived.status = 'archived';
  products.push(archived);

  return {
    settings: {
      shop_name: 'Demo Shop',
      currency: 'ETB',
      timezone: 'Africa/Addis_Ababa',
      allow_negative_stock: false,
      staff_can_restock: false,
      staff_can_sell_below_cost: false,
      receipt_footer: 'Thank you!',
      default_reorder_level: 5,
      slow_mover_days: 30,
      daily_summary_enabled: false,
      daily_summary_time: '21:00',
      low_stock_alerts: false,
      updated_at: iso(1),
    },
    users: [
      { telegram_id: MOCK_USERS.owner, public_id: uuid(9001), username: 'owner_demo', first_name: 'Dawit', last_name: '', role: 'owner', is_banned: false, language: 'en', created_at: iso(90), last_seen_at: iso(0) },
      { telegram_id: MOCK_USERS.staff, public_id: uuid(1001), username: 'cashier_demo', first_name: 'Abel', last_name: '', role: 'staff', is_banned: false, language: 'en', created_at: iso(40), last_seen_at: iso(0) },
      { telegram_id: MOCK_USERS.stranger, public_id: uuid(1002), username: 'new_person', first_name: 'Bethel', last_name: '', role: 'user', is_banned: false, language: 'en', created_at: iso(1), last_seen_at: iso(1) },
    ],
    categories,
    products,
    movements: products
      .filter((x) => x.stock_qty > 0)
      .map((x, i) => ({
        id: i + 1,
        product_id: x.id,
        type: 'opening' as const,
        qty_delta: x.stock_qty,
        unit_cost: x.avg_cost,
        stock_after: x.stock_qty,
        sale_id: null,
        supplier: '',
        reason: '',
        actor_id: MOCK_USERS.owner,
        created_at: iso(60),
      })),
    sales: [],
    expenses: [
      { id: uuid(301), spent_on: iso(12).slice(0, 10), category: 'rent', amount: 6000, note: 'Monthly rent', created_by: MOCK_USERS.owner, created_at: iso(12), updated_at: iso(12) },
      { id: uuid(302), spent_on: iso(5).slice(0, 10), category: 'transport', amount: 350, note: 'Merkato pickup', created_by: MOCK_USERS.owner, created_at: iso(5), updated_at: iso(5) },
      { id: uuid(303), spent_on: iso(2).slice(0, 10), category: 'utilities', amount: 480, note: 'Electricity', created_by: MOCK_USERS.owner, created_at: iso(2), updated_at: iso(2) },
    ],
    customers: [
      { id: uuid(401), name: 'Almaz Kebede', phone: '+251911223344', note: '', archived: false, created_at: iso(20) },
      { id: uuid(402), name: 'Yonas Tadesse', phone: '', note: 'Pays on Fridays', archived: false, created_at: iso(15) },
    ],
    customerPayments: [],
    seq: { movement: 100, saleItem: 1, receipt: 1000 },
  };
}
