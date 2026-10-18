/**
 * In-memory backend implementing the shop RPC contract for local development and e2e tests.
 * Loaded only when `useMockBackend` is true (never in a normal production build).
 * Role checks and JSON shapes mirror the SQL (supabase/migrations/20261018…). RPCs of later
 * phases raise `unsupported` until they are implemented here.
 */
import type { Backend } from '../backend';
import { AppError } from '../errors';
import type {
  Category,
  FnMap,
  FnName,
  LowStockItem,
  Me,
  Member,
  Product,
  ProductFilters,
  RpcArgs,
  RpcName,
  RpcResult,
  StockStatus,
} from '../types';
import { MOCK_USER_KEY } from './constants';
import { MOCK_USERS, seedDatabase, type MockDb, type MockProduct, type MockUser } from './seed';

type Handler<K extends RpcName> = (args: RpcArgs<K>) => RpcResult<K>;
type Handlers = { [K in RpcName]?: Handler<K> };

const round2 = (n: number) => Math.round(n * 100) / 100;

export function stockStatusOf(p: Pick<MockProduct, 'stock_qty' | 'reorder_level'>): StockStatus {
  if (p.stock_qty <= 0) return 'out';
  if (p.stock_qty <= p.reorder_level) return 'low';
  return 'ok';
}

export function createMockBackend(db: MockDb = seedDatabase()): Backend {
  const currentId = (): string => {
    try {
      return window.localStorage.getItem(MOCK_USER_KEY) ?? MOCK_USERS.owner;
    } catch {
      return MOCK_USERS.owner;
    }
  };

  const caller = (): MockUser => {
    const u = db.users.find((x) => x.telegram_id === currentId());
    if (!u) throw new AppError('not_authenticated');
    if (u.is_banned) throw new AppError('banned');
    return u;
  };
  const member = (): MockUser => {
    const u = caller();
    if (u.role === 'user') throw new AppError('no_access');
    return u;
  };
  const owner = (): MockUser => {
    const u = member();
    if (u.role !== 'owner') throw new AppError('not_authorized');
    return u;
  };

  const settingsFor = (isOwner: boolean) => {
    const s = db.settings;
    const base = {
      shop_name: s.shop_name,
      currency: s.currency,
      timezone: s.timezone,
      allow_negative_stock: s.allow_negative_stock,
      staff_can_restock: s.staff_can_restock,
      staff_can_sell_below_cost: s.staff_can_sell_below_cost,
      receipt_footer: s.receipt_footer,
    };
    return isOwner ? { ...s } : base;
  };

  const meJson = (u: MockUser): Me => ({
    public_id: u.public_id,
    username: u.username,
    first_name: u.first_name,
    last_name: u.last_name,
    photo_url: '',
    language: u.language,
    role: u.role,
    is_banned: u.is_banned,
    settings: u.role !== 'user' && !u.is_banned ? settingsFor(u.role === 'owner') : { shop_name: db.settings.shop_name },
  });

  const memberJson = (u: MockUser): Member => ({
    public_id: u.public_id,
    name: [u.first_name, u.last_name].filter(Boolean).join(' ') || u.username,
    username: u.username,
    photo_url: '',
    role: u.role,
    is_banned: u.is_banned,
    last_seen_at: u.last_seen_at,
    created_at: u.created_at,
  });

  const categoryJson = (c: MockDb['categories'][number]): Category => ({
    ...c,
    product_count: db.products.filter((p) => p.category_id === c.id && p.status === 'active').length,
  });

  const productJson = (p: MockProduct, isOwner: boolean): Product => {
    const base: Product = {
      id: p.id,
      name: p.name,
      category_id: p.category_id,
      category_name: db.categories.find((c) => c.id === p.category_id)?.name ?? null,
      sku: p.sku,
      barcode: p.barcode,
      unit: p.unit,
      sell_price: p.sell_price,
      stock_qty: p.stock_qty,
      reorder_level: p.reorder_level,
      stock_status: stockStatusOf(p),
      image_path: p.image_path,
      notes: p.notes,
      status: p.status,
      created_at: p.created_at,
      updated_at: p.updated_at,
    };
    if (!isOwner) return base;
    const stock = Math.max(p.stock_qty, 0);
    return {
      ...base,
      avg_cost: round2(p.avg_cost),
      margin: round2(p.sell_price - p.avg_cost),
      margin_pct: p.sell_price > 0 ? Math.round(((p.sell_price - p.avg_cost) / p.sell_price) * 1000) / 10 : null,
      stock_value_cost: round2(stock * p.avg_cost),
      stock_value_retail: round2(stock * p.sell_price),
    };
  };

  const filterProducts = (f: ProductFilters, isOwner: boolean): MockProduct[] => {
    const status = isOwner ? (f.status ?? 'active') : 'active';
    const q = f.q?.trim().toLowerCase() ?? '';
    let sort = f.sort ?? 'name';
    if (!isOwner && sort === 'margin') sort = 'name';
    const list = db.products.filter(
      (p) =>
        (status === 'all' || p.status === status) &&
        (!f.category_id || p.category_id === f.category_id) &&
        (!f.stock || stockStatusOf(p) === f.stock) &&
        (!q || p.name.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().startsWith(q) || p.barcode === f.q?.trim()),
    );
    const byName = (a: MockProduct, b: MockProduct) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id.localeCompare(b.id);
    const cmp: Record<string, (a: MockProduct, b: MockProduct) => number> = {
      name: byName,
      stock_asc: (a, b) => a.stock_qty - b.stock_qty || byName(a, b),
      stock_desc: (a, b) => b.stock_qty - a.stock_qty || byName(a, b),
      margin: (a, b) => b.sell_price - b.avg_cost - (a.sell_price - a.avg_cost) || byName(a, b),
      newest: (a, b) => b.created_at.localeCompare(a.created_at) || byName(a, b),
      best_selling: byName, // no sales history in the mock until Phase 4
    };
    return list.sort(cmp[sort] ?? byName);
  };

  const handlers: Handlers = {
    get_me: () => meJson(caller()),
    update_my_profile: ({ p_input }) => {
      const u = caller();
      if (p_input.language) {
        if (p_input.language !== 'en' && p_input.language !== 'am') throw new AppError('invalid_input', 'language');
        u.language = p_input.language;
      }
      return meJson(u);
    },
    get_settings: () => settingsFor(member().role === 'owner'),
    update_settings: ({ p_input }) => {
      owner();
      const next = { ...db.settings, ...p_input };
      if (typeof next.shop_name !== 'string' || next.shop_name.length > 80) throw new AppError('invalid_input', 'settings');
      try {
        new Intl.DateTimeFormat('en', { timeZone: next.timezone });
      } catch {
        throw new AppError('invalid_input', 'settings');
      }
      db.settings = { ...next, updated_at: new Date().toISOString() };
      return settingsFor(true);
    },
    list_team: () => {
      const me = owner();
      return {
        me: me.public_id,
        members: db.users.filter((u) => u.role !== 'user').map(memberJson),
        requests: db.users.filter((u) => u.role === 'user' && !u.is_banned).map(memberJson),
      };
    },
    set_member_role: ({ p_public_id, p_role }) => {
      owner();
      if (!['user', 'staff', 'owner'].includes(p_role)) throw new AppError('invalid_input', 'role');
      const target = db.users.find((u) => u.public_id === p_public_id);
      if (!target) throw new AppError('not_found');
      if (target.role === 'owner' && p_role !== 'owner' && db.users.filter((u) => u.role === 'owner' && !u.is_banned).length <= 1) {
        throw new AppError('last_owner');
      }
      target.role = p_role;
      return memberJson(target);
    },
    list_categories: ({ p_include_archived }) => {
      member();
      return db.categories
        .filter((c) => p_include_archived || !c.archived)
        .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
        .map(categoryJson);
    },
    upsert_category: ({ p_input }) => {
      owner();
      const name = p_input.name.trim();
      if (name.length < 1 || name.length > 60) throw new AppError('invalid_input', 'name');
      if (db.categories.some((c) => c.id !== p_input.id && c.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError('duplicate_category');
      }
      if (p_input.id) {
        const c = db.categories.find((x) => x.id === p_input.id);
        if (!c) throw new AppError('not_found');
        c.name = name;
        c.sort = p_input.sort ?? c.sort;
        return categoryJson(c);
      }
      const c = { id: crypto.randomUUID(), name, sort: p_input.sort ?? 0, archived: false };
      db.categories.push(c);
      return categoryJson(c);
    },
    set_category_archived: ({ p_id, p_archived }) => {
      owner();
      const c = db.categories.find((x) => x.id === p_id);
      if (!c) throw new AppError('not_found');
      c.archived = p_archived;
      return categoryJson(c);
    },
    list_products: ({ p_filters = {}, p_limit = 50, p_offset = 0 }) => {
      const isOwner = member().role === 'owner';
      const all = filterProducts(p_filters, isOwner);
      const limit = Math.min(Math.max(p_limit, 1), 200);
      return { total: all.length, items: all.slice(p_offset, p_offset + limit).map((p) => productJson(p, isOwner)) };
    },
    get_product: ({ p_id }) => {
      const isOwner = member().role === 'owner';
      const p = db.products.find((x) => x.id === p_id);
      if (!p || (!isOwner && p.status !== 'active')) throw new AppError('not_found');
      return productJson(p, isOwner);
    },
    find_product_by_code: ({ p_code }) => {
      const isOwner = member().role === 'owner';
      const code = p_code.trim();
      const p = db.products.find((x) => x.status === 'active' && (x.barcode === code || x.sku?.toLowerCase() === code.toLowerCase()));
      return p ? productJson(p, isOwner) : null;
    },
    low_stock: ({ p_limit = 20 }) => {
      member();
      return db.products
        .filter((p) => p.status === 'active' && p.stock_qty <= p.reorder_level)
        .sort((a, b) => a.stock_qty - a.reorder_level - (b.stock_qty - b.reorder_level) || a.name.localeCompare(b.name))
        .slice(0, p_limit)
        .map(
          (p): LowStockItem => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            stock_qty: p.stock_qty,
            reorder_level: p.reorder_level,
            stock_status: stockStatusOf(p),
          }),
        );
    },
  };

  const delay = () => new Promise((r) => setTimeout(r, 120));

  return {
    kind: 'mock',
    async rpc<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>> {
      await delay();
      const handler = handlers[name] as Handler<K> | undefined;
      if (!handler) throw new AppError('unsupported', `mock: ${name}`);
      // Deep copy so callers never mutate the mock "database".
      return structuredClone(handler(args));
    },
    async fn<K extends FnName>(name: K, body: FnMap[K][0]): Promise<FnMap[K][1]> {
      await delay();
      if (name === 'auth-telegram') {
        void body;
        return { access_token: 'mock-token', expires_at: Math.floor(Date.now() / 1000) + 12 * 3600 } as FnMap[K][1];
      }
      throw new AppError('unsupported', `mock: ${name}`);
    },
    async uploadToSignedUrl() {
      await delay();
    },
    imageUrl(path) {
      return path ? `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#ccd"/></svg>')}` : '';
    },
  };
}

