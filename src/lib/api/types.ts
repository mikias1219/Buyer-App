/**
 * Domain types mirroring the JSON returned by the shop RPCs (supabase/migrations/20261018…).
 * Keep in sync with the SQL; the mock backend implements the same contract.
 * Numbers arrive as JSON numbers (Postgres numeric → JSON number via jsonb).
 */

export type Role = 'user' | 'staff' | 'owner';
export type Language = 'en' | 'am';

export const UNITS = ['piece', 'pack', 'box', 'kg', 'g', 'litre', 'metre'] as const;
export type Unit = (typeof UNITS)[number];
/** Units sold in whole numbers only (SPEC A3.14). */
export const WHOLE_UNITS: readonly Unit[] = ['piece', 'pack', 'box'];

export const STOCK_STATUSES = ['ok', 'low', 'out'] as const;
export type StockStatus = (typeof STOCK_STATUSES)[number];

export const PAYMENT_METHODS = ['cash', 'telebirr', 'bank', 'credit'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const EXPENSE_CATEGORIES = ['rent', 'salary', 'transport', 'utilities', 'supplies', 'tax', 'other'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const MOVEMENT_TYPES = ['opening', 'purchase', 'sale', 'return', 'void', 'adjustment', 'damage'] as const;
export type MovementType = (typeof MOVEMENT_TYPES)[number];

export type ProductStatus = 'active' | 'archived';
export type SaleStatus = 'completed' | 'voided';

// ─── Session, settings, team ────────────────────────────────────────

export interface ShopSettings {
  shop_name: string;
  currency: string;
  timezone: string;
  allow_negative_stock: boolean;
  staff_can_restock: boolean;
  staff_can_sell_below_cost: boolean;
  receipt_footer: string;
  // owner only
  default_reorder_level?: number;
  slow_mover_days?: number;
  daily_summary_enabled?: boolean;
  daily_summary_time?: string;
  low_stock_alerts?: boolean;
  updated_at?: string;
}

export interface Me {
  public_id: string;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  language: Language;
  role: Role;
  is_banned: boolean;
  /** Full settings for members; only `shop_name` for users without access. */
  settings: Partial<ShopSettings> & { shop_name: string };
}

export interface Member {
  public_id: string;
  name: string;
  username: string;
  photo_url: string;
  role: Role;
  is_banned: boolean;
  last_seen_at: string;
  created_at: string;
}

export interface Team {
  me: string;
  members: Member[];
  requests: Member[];
}

export type SettingsInput = Partial<
  Pick<
    ShopSettings,
    | 'shop_name'
    | 'timezone'
    | 'default_reorder_level'
    | 'allow_negative_stock'
    | 'staff_can_restock'
    | 'staff_can_sell_below_cost'
    | 'slow_mover_days'
    | 'daily_summary_enabled'
    | 'daily_summary_time'
    | 'low_stock_alerts'
    | 'receipt_footer'
  >
>;

// ─── Catalog & stock ────────────────────────────────────────────────

export interface Category {
  id: string;
  name: string;
  sort: number;
  archived: boolean;
  product_count: number;
}

export interface Product {
  id: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  sku: string | null;
  barcode: string | null;
  unit: Unit;
  sell_price: number;
  stock_qty: number;
  reorder_level: number;
  stock_status: StockStatus;
  image_path: string;
  notes: string;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  // owner only
  avg_cost?: number;
  margin?: number;
  margin_pct?: number | null;
  stock_value_cost?: number;
  stock_value_retail?: number;
  // sort=best_selling only
  sold_30d?: number;
}

export interface ProductInput {
  name?: string;
  category_id?: string | null;
  sku?: string | null;
  barcode?: string | null;
  unit?: Unit;
  sell_price?: number;
  cost_price?: number;
  reorder_level?: number;
  image_path?: string;
  notes?: string;
  /** create only */
  opening_stock?: number;
}

export const PRODUCT_SORTS = ['name', 'stock_asc', 'stock_desc', 'best_selling', 'margin', 'newest'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export interface ProductFilters {
  q?: string;
  category_id?: string;
  stock?: StockStatus;
  status?: ProductStatus | 'all';
  sort?: ProductSort;
}

export interface ProductPage {
  total: number;
  items: Product[];
}

export interface Movement {
  id: number;
  type: MovementType;
  qty_delta: number;
  unit_cost: number;
  stock_after: number;
  sale_id: string | null;
  receipt_no: number | null;
  supplier: string;
  reason: string;
  created_at: string;
  actor_name: string | null;
}

export interface LowStockItem {
  id: string;
  name: string;
  unit: Unit;
  stock_qty: number;
  reorder_level: number;
  stock_status: StockStatus;
}

export interface RestockItem {
  product_id: string;
  qty: number;
  unit_cost?: number;
}

// ─── Sales ──────────────────────────────────────────────────────────

export interface SaleItemInput {
  product_id: string;
  qty: number;
  discount?: number;
}

export interface SaleItem {
  id: number;
  product_id: string;
  product_name: string;
  unit: Unit;
  qty: number;
  unit_price: number;
  discount: number;
  line_total: number;
  returned_qty: number;
  // owner only
  unit_cost?: number;
  line_profit?: number;
}

export interface SaleReturn {
  id: string;
  reason: string;
  refund_amount: number;
  created_at: string;
  items: Array<{ sale_item_id: number; qty: number }>;
}

export interface Sale {
  id: string;
  receipt_no: number;
  sold_at: string;
  cashier_id: string;
  cashier_name: string;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  note: string;
  void_reason: string;
  voided_at: string | null;
  refunded: number;
  items: SaleItem[];
  returns: SaleReturn[];
  // owner only
  total_cost?: number;
  profit?: number;
}

export interface SaleSummary {
  id: string;
  receipt_no: number;
  sold_at: string;
  cashier_name: string;
  payment_method: PaymentMethod;
  total: number;
  status: SaleStatus;
  item_count: number;
  has_returns: boolean;
  profit?: number;
}

export interface SalesFilters {
  from?: string;
  to?: string;
  payment_methods?: PaymentMethod[];
  cashier_ids?: string[];
  product_ids?: string[];
  status?: SaleStatus | 'all';
  q?: string;
}

export interface SalesPage {
  total_count: number;
  total_amount: number;
  items: SaleSummary[];
}

// ─── Expenses & reports ─────────────────────────────────────────────

export interface Expense {
  id: string;
  spent_on: string;
  category: ExpenseCategory;
  amount: number;
  note: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface ExpenseInput {
  spent_on?: string;
  category?: ExpenseCategory;
  amount?: number;
  note?: string;
}

export interface ExpensesPage {
  total_amount: number;
  total_count: number;
  by_category: Array<{ category: ExpenseCategory; amount: number }>;
  items: Expense[];
}

/** One filter shape for every report (local dates, inclusive). */
export interface ReportFilters {
  from?: string;
  to?: string;
  category_ids?: string[];
  product_ids?: string[];
  payment_methods?: PaymentMethod[];
  cashier_ids?: string[];
}

export interface Kpis {
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number | null;
  expenses: number;
  stock_loss: number;
  adjustments_value: number;
  net_profit: number;
  items_sold: number;
  sales_count: number;
  avg_sale: number | null;
  returns_amount: number;
}

export interface StockTotals {
  product_count: number;
  units: number;
  value_cost: number;
  value_retail: number;
  potential_profit: number;
  low_count: number;
  out_count: number;
}

export interface DashboardSummary {
  range: { from: string; to: string; previous_from: string; previous_to: string };
  scoped: boolean;
  current: Kpis;
  previous: Kpis;
  stock: StockTotals;
}

export type TrendBucket = 'day' | 'week' | 'month';
export interface TrendPoint {
  bucket: string;
  revenue: number;
  profit: number;
  items: number;
  sales: number;
}

export interface ProductPerformance {
  product_id: string;
  name: string;
  unit: Unit;
  category_name: string | null;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number | null;
  sales: number;
  stock_qty: number;
}

export interface SlowMover {
  product_id: string;
  name: string;
  unit: Unit;
  stock_qty: number;
  stock_value_cost: number;
  last_sold_at: string | null;
}

export interface ExportLine {
  date: string;
  kind: 'sale' | 'return';
  receipt_no: number;
  product: string;
  category: string | null;
  qty: number;
  revenue: number;
  cost: number;
  profit: number;
  payment_method: PaymentMethod;
  cashier: string;
}

// ─── RPC contract ───────────────────────────────────────────────────

type Void = Record<string, never>;

export interface RpcMap {
  // session, settings, team
  get_me: [Void, Me];
  update_my_profile: [{ p_input: { language?: Language } }, Me];
  get_settings: [Void, ShopSettings];
  update_settings: [{ p_input: SettingsInput }, ShopSettings];
  list_team: [Void, Team];
  set_member_role: [{ p_public_id: string; p_role: Role }, Member];
  // catalog
  list_categories: [{ p_include_archived?: boolean }, Category[]];
  upsert_category: [{ p_input: { id?: string; name: string; sort?: number } }, Category];
  set_category_archived: [{ p_id: string; p_archived: boolean }, Category];
  list_products: [{ p_filters?: ProductFilters; p_limit?: number; p_offset?: number }, ProductPage];
  get_product: [{ p_id: string }, Product];
  find_product_by_code: [{ p_code: string }, Product | null];
  create_product: [{ p_input: ProductInput }, Product];
  update_product: [{ p_id: string; p_input: ProductInput }, Product];
  set_product_status: [{ p_id: string; p_status: ProductStatus }, Product];
  delete_product: [{ p_id: string }, null];
  // stock
  restock: [{ p_items: RestockItem[]; p_supplier?: string; p_note?: string }, Product[]];
  adjust_stock: [{ p_product_id: string; p_mode: 'set' | 'loss'; p_qty: number; p_reason: string }, Product];
  product_movements: [{ p_product_id: string; p_before?: number | null; p_limit?: number }, Movement[]];
  low_stock: [{ p_limit?: number }, LowStockItem[]];
  // sales
  record_sale: [
    { p_client_ref: string; p_items: SaleItemInput[]; p_payment_method: PaymentMethod; p_discount?: number; p_note?: string },
    Sale,
  ];
  void_sale: [{ p_id: string; p_reason: string }, Sale];
  return_sale_items: [{ p_sale_id: string; p_items: Array<{ sale_item_id: number; qty: number }>; p_reason: string }, Sale];
  get_sale: [{ p_id: string }, Sale];
  list_sales: [{ p_filters?: SalesFilters; p_limit?: number; p_offset?: number }, SalesPage];
  // expenses
  create_expense: [{ p_input: ExpenseInput }, Expense];
  update_expense: [{ p_id: string; p_input: ExpenseInput }, Expense];
  delete_expense: [{ p_id: string }, null];
  list_expenses: [{ p_filters?: { from?: string; to?: string; categories?: ExpenseCategory[] }; p_limit?: number; p_offset?: number }, ExpensesPage];
  // reports (owner)
  dashboard_summary: [{ p_filters?: ReportFilters }, DashboardSummary];
  sales_trend: [{ p_filters?: ReportFilters; p_bucket?: TrendBucket | null }, { bucket: TrendBucket; points: TrendPoint[] }];
  product_performance: [{ p_filters?: ReportFilters; p_sort?: 'qty' | 'revenue' | 'profit'; p_limit?: number }, ProductPerformance[]];
  category_breakdown: [{ p_filters?: ReportFilters }, Array<{ category_id: string | null; name: string | null; qty: number; revenue: number; profit: number }>];
  payment_breakdown: [{ p_filters?: ReportFilters }, Array<{ payment_method: PaymentMethod; revenue: number; sales: number }>];
  cashier_breakdown: [{ p_filters?: ReportFilters }, Array<{ cashier_id: string; name: string; revenue: number; sales: number }>];
  slow_movers: [{ p_days?: number | null; p_limit?: number }, SlowMover[]];
  stock_summary: [
    { p_filters?: Pick<ReportFilters, 'category_ids'> },
    { totals: StockTotals; by_category: Array<{ category_id: string | null; name: string | null; product_count: number; units: number; value_cost: number; value_retail: number }> },
  ];
  export_sales_lines: [{ p_filters?: ReportFilters }, ExportLine[]];
}

export type RpcName = keyof RpcMap;
export type RpcArgs<K extends RpcName> = RpcMap[K][0];
export type RpcResult<K extends RpcName> = RpcMap[K][1];

export interface FnMap {
  'auth-telegram': [{ initData: string }, { access_token: string; expires_at: number }];
  storage: [{ action: 'product-image'; ext: string }, { path: string; token: string; signed_url: string }];
}
export type FnName = keyof FnMap;
