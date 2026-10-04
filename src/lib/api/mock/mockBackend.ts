/**
 * In-memory backend implementing the RPC contract for local development and e2e tests.
 * Loaded only when `useMockBackend` is true (never in a normal production build).
 * Business rules reuse features/listings/logic.ts so behaviour matches the database.
 */
import {
  decideRenewal,
  decideSubmission,
  normalizeReference,
  priceFlag,
} from '../../../features/listings/logic';
import type { Backend } from '../backend';
import { AppError } from '../errors';
import type {
  AdminPayment,
  AdminSettings,
  AdminUser,
  AuditEntry,
  Category,
  Condition,
  FnMap,
  FnName,
  ListingCard,
  ListingDetail,
  ListingFlag,
  ListingImage,
  ListingInput,
  ListingStatus,
  Me,
  MyListing,
  PaymentDetail,
  PaymentKind,
  PaymentRejectReason,
  PaymentStatus,
  RejectReason,
  ReportReason,
  Role,
  RpcArgs,
  RpcMap,
  RpcName,
  RpcResult,
  SearchArgs,
  Specs,
} from '../types';
import { MOCK_USER_KEY } from './constants';
import { mockImageDataUrl, seedDatabase } from './seed';

export interface MockUser {
  telegram_id: string;
  public_id: string;
  username: string;
  first_name: string;
  phone: string;
  phone_verified: boolean;
  city: string;
  role: Role;
  is_banned: boolean;
  ban_reason: string;
  is_verified_seller: boolean;
  language: 'en' | 'am';
  listings_free_used: number;
  created_at: string;
}

export interface MockProduct {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  price: number | null;
  category: Category | null;
  brand: string;
  model: string;
  condition: Condition | null;
  city: string;
  specs: Specs;
  negotiable: boolean;
  exchange: boolean;
  status: ListingStatus;
  is_free: boolean;
  period_paid: boolean;
  reject_reason: RejectReason | null;
  reject_note: string;
  flags: ListingFlag[];
  renew_count: number;
  views: number;
  expires_at: string | null;
  boosted_until: string | null;
  published_at: string | null;
  status_changed_at: string;
  created_at: string;
  updated_at: string;
  images: ListingImage[];
}

export interface MockPayment {
  id: string;
  telegram_id: string;
  product_id: string;
  kind: PaymentKind;
  amount_etb: number;
  reference: string;
  screenshot_path: string;
  status: PaymentStatus;
  reject_reason: PaymentRejectReason | null;
  admin_note: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  refunded_at: string | null;
  created_at: string;
}

export interface MockDb {
  settings: AdminSettings;
  users: MockUser[];
  products: MockProduct[];
  payments: MockPayment[];
  favorites: Array<{ telegram_id: string; product_id: string; created_at: string }>;
  leads: Array<{ product_id: string; buyer_id: string; seller_id: string; created_at: string }>;
  reports: Array<{
    id: string;
    reporter_id: string;
    target_type: 'product' | 'user';
    target_id: string;
    reason: ReportReason;
    note: string;
    status: 'open' | 'dismissed' | 'actioned';
    resolution: string;
    created_at: string;
  }>;
  reviews: Array<{ seller_id: string; reviewer_id: string; product_id: string; rating: number; comment: string; created_at: string }>;
  audit: AuditEntry[];
}

const STORAGE_KEY = 'tm_mock_db_v1';
const DAY = 86_400_000;

const now = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
const err = (code: string, detail = '') => new AppError(code, detail);

function load(): MockDb {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockDb;
  } catch {
    /* fall through to seed */
  }
  return seedDatabase();
}

export function createMockBackend(): Backend {
  const db: MockDb = load();
  const uploads = new Map<string, string>();
  const save = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch {
      /* quota exceeded or storage disabled: keep in memory */
    }
  };

  let currentToken: string | null = null;
  const meId = (): string | null => (currentToken ? currentToken.replace('mock.', '') : null);

  function requireUser(allowBanned = false): MockUser {
    const id = meId();
    const u = db.users.find((x) => x.telegram_id === id);
    if (!u) throw err('not_authenticated');
    if (u.is_banned && !allowBanned) throw err('banned');
    return u;
  }
  const requireStaff = () => {
    const u = requireUser();
    if (u.role === 'user') throw err('not_authorized');
    return u;
  };
  const requireAdmin = () => {
    const u = requireUser();
    if (u.role !== 'admin') throw err('not_authorized');
    return u;
  };
  const userById = (id: string) => db.users.find((u) => u.telegram_id === id);
  const product = (id: string) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) throw err('not_found');
    return p;
  };
  const ownProduct = (id: string, me: MockUser) => {
    const p = db.products.find((x) => x.id === id);
    if (!p || p.seller_id !== me.telegram_id) throw err('not_found');
    return p;
  };
  const setStatus = (p: MockProduct, s: ListingStatus) => {
    if (p.status !== s) p.status_changed_at = now();
    p.status = s;
    p.updated_at = now();
  };
  const audit = (action: string, target_type: string, target_id: string, before: unknown, after: unknown) => {
    const actor = userById(meId() ?? '');
    db.audit.unshift({
      id: db.audit.length + 1,
      action,
      target_type,
      target_id,
      before: (before as Record<string, unknown>) ?? null,
      after: (after as Record<string, unknown>) ?? null,
      created_at: now(),
      actor: { name: actor?.first_name ?? null, username: actor?.username ?? null, public_id: actor?.public_id ?? null },
    });
  };

  const isPublic = (p: MockProduct) => {
    const s = userById(p.seller_id);
    return p.status === 'active' && !s?.is_banned && (!p.expires_at || p.expires_at > now());
  };
  const featured = (p: MockProduct) => Boolean(p.boosted_until && p.boosted_until > now());
  const cover = (p: MockProduct) => p.images[0]?.path ?? null;
  const card = (p: MockProduct): ListingCard => ({
    id: p.id,
    title: p.title,
    price: p.price,
    category: p.category,
    brand: p.brand,
    model: p.model,
    condition: p.condition,
    city: p.city,
    negotiable: p.negotiable,
    exchange: p.exchange,
    is_featured: featured(p),
    published_at: p.published_at,
    cover_path: cover(p),
    seller_verified: userById(p.seller_id)?.is_verified_seller ?? false,
  });
  const rating = (sellerId: string) => {
    const rs = db.reviews.filter((r) => r.seller_id === sellerId);
    return {
      rating: rs.length ? Math.round((rs.reduce((a, r) => a + r.rating, 0) / rs.length) * 10) / 10 : null,
      count: rs.length,
    };
  };
  const byNewest = (a: MockProduct, b: MockProduct) => (b.published_at ?? '').localeCompare(a.published_at ?? '');
  const publicList = () => db.products.filter(isPublic).sort(byNewest);

  const median = (category: Category, brand: string, exclude?: string): number | null => {
    const prices = publicList()
      .filter((p) => p.category === category && (!brand || p.brand.toLowerCase() === brand.toLowerCase()) && p.id !== exclude)
      .map((p) => p.price ?? 0)
      .sort((a, b) => a - b);
    if (prices.length < 5) return null;
    const mid = Math.floor(prices.length / 2);
    return prices.length % 2 ? (prices[mid] ?? null) : ((prices[mid - 1] ?? 0) + (prices[mid] ?? 0)) / 2;
  };
  const computeFlags = (p: MockProduct): ListingFlag[] => {
    const flags: ListingFlag[] = [];
    const f = p.category ? priceFlag(p.price, median(p.category, p.brand, p.id)) : null;
    if (f) flags.push(f);
    const hashes = new Set(p.images.map((i) => i.hash).filter(Boolean));
    if (
      hashes.size &&
      db.products.some(
        (o) =>
          o.id !== p.id &&
          o.seller_id !== p.seller_id &&
          ['active', 'paused', 'in_review', 'payment_submitted'].includes(o.status) &&
          o.images.some((i) => hashes.has(i.hash)),
      )
    ) {
      flags.push('duplicate_image');
    }
    return flags;
  };
  const openListings = (sellerId: string, exclude?: string) =>
    db.products.filter(
      (p) =>
        p.seller_id === sellerId &&
        p.id !== exclude &&
        ['pending_payment', 'payment_submitted', 'in_review', 'active', 'paused'].includes(p.status),
    ).length;
  const bannedWord = (text: string) =>
    db.settings.banned_words.some((w) => w.trim() && text.toLowerCase().includes(w.trim().toLowerCase()));

  const goLive = (p: MockProduct) => {
    const stillValid = p.expires_at && p.expires_at > now();
    if (!stillValid || !p.published_at) p.published_at = now();
    if (!stillValid) p.expires_at = new Date(Date.now() + db.settings.listing_duration_days * DAY).toISOString();
    p.reject_reason = null;
    p.reject_note = '';
    setStatus(p, 'active');
  };

  const ensureOpenPayment = (p: MockProduct, kind: PaymentKind, amount: number): MockPayment => {
    const existing = db.payments.find((x) => x.product_id === p.id && x.kind === kind && x.status === 'pending');
    if (existing) {
      existing.amount_etb = amount;
      return existing;
    }
    if (db.payments.some((x) => x.product_id === p.id && x.kind === kind && x.status === 'submitted')) {
      throw err('payment_already_submitted');
    }
    const pay: MockPayment = {
      id: uuid(),
      telegram_id: p.seller_id,
      product_id: p.id,
      kind,
      amount_etb: amount,
      reference: '',
      screenshot_path: '',
      status: 'pending',
      reject_reason: null,
      admin_note: '',
      submitted_at: null,
      reviewed_at: null,
      refunded_at: null,
      created_at: now(),
    };
    db.payments.unshift(pay);
    return pay;
  };

  const paymentJson = (pay: MockPayment): PaymentDetail => {
    const p = product(pay.product_id);
    return {
      id: pay.id,
      kind: pay.kind,
      status: pay.status,
      amount_etb: pay.amount_etb,
      reference: pay.reference,
      has_screenshot: pay.screenshot_path !== '',
      reject_reason: pay.reject_reason,
      admin_note: pay.admin_note,
      submitted_at: pay.submitted_at,
      reviewed_at: pay.reviewed_at,
      created_at: pay.created_at,
      product: { id: p.id, title: p.title, price: p.price, status: p.status, cover_path: cover(p) },
    };
  };

  const applyInput = (p: MockProduct, input: ListingInput) => {
    if (input.price !== undefined && input.price !== null && (!(input.price > 0) || input.price >= 1e8)) {
      throw err('invalid_input', 'price');
    }
    if (input.title !== undefined && input.title.trim().length > 80) throw err('invalid_input', 'title');
    if (input.description !== undefined && input.description.trim().length > 2000) throw err('invalid_input', 'description');
    Object.assign(p, {
      ...(input.title !== undefined && { title: input.title.trim() }),
      ...(input.description !== undefined && { description: input.description.trim() }),
      ...(input.price !== undefined && { price: input.price }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.brand !== undefined && { brand: input.brand.trim() }),
      ...(input.model !== undefined && { model: input.model.trim() }),
      ...(input.condition !== undefined && { condition: input.condition }),
      ...(input.city !== undefined && { city: input.city.trim() }),
      ...(input.specs !== undefined && { specs: input.specs }),
      ...(input.negotiable !== undefined && { negotiable: input.negotiable }),
      ...(input.exchange !== undefined && { exchange: input.exchange }),
    });
    p.updated_at = now();
  };

  const missing = (p: MockProduct) =>
    [
      p.title.length < 3 && 'title',
      p.description.length < 10 && 'description',
      p.price === null && 'price',
      p.category === null && 'category',
      p.condition === null && 'condition',
      !p.city && 'city',
      p.images.length === 0 && 'photos',
    ].filter((x): x is string => Boolean(x));

  const meJson = (u: MockUser): Me => ({
    telegram_id: u.telegram_id,
    public_id: u.public_id,
    username: u.username,
    first_name: u.first_name,
    last_name: '',
    photo_url: '',
    phone_verified: u.phone_verified,
    phone_masked: u.phone ? `•••• ${u.phone.slice(-4)}` : null,
    city: u.city,
    role: u.role,
    is_banned: u.is_banned,
    ban_reason: u.ban_reason,
    is_verified_seller: u.is_verified_seller,
    language: u.language,
    free_listings_left: Math.max(db.settings.free_listings_quota - u.listings_free_used, 0),
    open_listings: openListings(u.telegram_id),
    created_at: u.created_at,
  });

  const adminUser = (u: MockUser): AdminUser => ({
    public_id: u.public_id,
    telegram_id: u.telegram_id,
    username: u.username,
    first_name: u.first_name,
    last_name: '',
    phone: u.phone,
    phone_verified: u.phone_verified,
    city: u.city,
    role: u.role,
    is_banned: u.is_banned,
    ban_reason: u.ban_reason,
    is_verified_seller: u.is_verified_seller,
    language: u.language,
    created_at: u.created_at,
    last_seen_at: u.created_at,
    live_count: db.products.filter((p) => p.seller_id === u.telegram_id && p.status === 'active').length,
    listing_count: db.products.filter((p) => p.seller_id === u.telegram_id).length,
    rating: rating(u.telegram_id),
  });

  type Handlers = { [K in RpcName]: (args: RpcArgs<K>) => RpcResult<K> };

  const handlers: Handlers = {
    // ─── public ───────────────────────────────────────────────────────
    search_listings(a: SearchArgs) {
      const words = (a.p_query ?? '').toLowerCase().trim().split(/\s+/).filter(Boolean);
      let list = publicList().filter(
        (p) =>
          words.every((w) => `${p.title} ${p.brand} ${p.model}`.toLowerCase().includes(w)) &&
          (!a.p_category || p.category === a.p_category) &&
          (!a.p_conditions?.length || (p.condition !== null && a.p_conditions.includes(p.condition))) &&
          (!a.p_city || p.city === a.p_city) &&
          (!a.p_brand || p.brand.toLowerCase() === a.p_brand.toLowerCase()) &&
          (a.p_min_price == null || (p.price ?? 0) >= a.p_min_price) &&
          (a.p_max_price == null || (p.price ?? 0) <= a.p_max_price) &&
          (!a.p_specs || Object.entries(a.p_specs).every(([k, v]) => p.specs[k] === v)) &&
          (!a.p_featured_only || featured(p)),
      );
      const sort = a.p_sort ?? 'newest';
      list = [...list].sort((x, y) => {
        if (sort === 'price_asc') return (x.price ?? 0) - (y.price ?? 0);
        if (sort === 'price_desc') return (y.price ?? 0) - (x.price ?? 0);
        return Number(featured(y)) - Number(featured(x)) || byNewest(x, y);
      });
      const limit = Math.min(Math.max(a.p_limit ?? 20, 1), 50);
      const offset = Math.max(a.p_offset ?? 0, 0);
      return {
        items: list.slice(offset, offset + limit).map(card),
        total: list.length,
        next_offset: list.length > offset + limit ? offset + limit : null,
      };
    },
    home_feed({ p_city }) {
      const list = publicList();
      const counts: Partial<Record<Category, number>> = {};
      for (const p of list) if (p.category) counts[p.category] = (counts[p.category] ?? 0) + 1;
      return {
        featured: list.filter(featured).slice(0, 10).map(card),
        newest: list.slice(0, 10).map(card),
        near_you: p_city ? list.filter((p) => p.city === p_city).slice(0, 10).map(card) : [],
        under_20k: list.filter((p) => (p.price ?? 0) <= 20000).slice(0, 10).map(card),
        category_counts: counts,
      };
    },
    get_listing({ p_id }) {
      const p = product(p_id);
      const me = meId();
      const owner = me === p.seller_id;
      const viewer = me ? userById(me) : undefined;
      const staff = viewer ? viewer.role !== 'user' : false;
      const pub = isPublic(p);
      if (!pub && !owner && !staff && p.status !== 'sold') throw err('not_found');
      const s = userById(p.seller_id);
      if (!s) throw err('not_found');
      const pays = db.payments.filter((x) => x.product_id === p.id);
      const detail: ListingDetail = {
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
        category: p.category,
        brand: p.brand,
        model: p.model,
        condition: p.condition,
        city: p.city,
        specs: p.specs,
        negotiable: p.negotiable,
        exchange: p.exchange,
        status: pub ? 'active' : p.status,
        published_at: p.published_at,
        expires_at: p.expires_at,
        is_featured: featured(p),
        views: p.views,
        images: p.images.map((i) => i.path),
        favorites_count: db.favorites.filter((f) => f.product_id === p.id).length,
        is_owner: owner,
        is_favorite: Boolean(me && db.favorites.some((f) => f.product_id === p.id && f.telegram_id === me)),
        can_review: Boolean(
          me &&
            p.status === 'sold' &&
            !owner &&
            db.leads.some((l) => l.product_id === p.id && l.buyer_id === me) &&
            !db.reviews.some((r) => r.product_id === p.id && r.reviewer_id === me),
        ),
        seller: {
          public_id: s.public_id,
          name: s.first_name,
          verified: s.is_verified_seller,
          member_since: s.created_at,
          rating: rating(s.telegram_id),
          active_count: publicList().filter((x) => x.seller_id === s.telegram_id).length,
        },
      };
      if (owner || staff) {
        const open = pays.find((x) => x.status === 'pending' || x.status === 'submitted');
        const last = pays[0];
        detail.manage = {
          status: p.status,
          reject_reason: p.reject_reason,
          reject_note: p.reject_note,
          flags: p.flags,
          is_free: p.is_free,
          period_paid: p.period_paid,
          renew_count: p.renew_count,
          boosted_until: p.boosted_until,
          leads_count: db.leads.filter((l) => l.product_id === p.id).length,
          open_payment: open ? { id: open.id, kind: open.kind, status: open.status, amount_etb: open.amount_etb } : null,
          last_payment: last
            ? {
                id: last.id,
                kind: last.kind,
                status: last.status,
                amount_etb: last.amount_etb,
                reject_reason: last.reject_reason,
                admin_note: last.admin_note,
              }
            : null,
        };
      }
      return detail;
    },
    get_seller({ p_public_id }) {
      const s = db.users.find((u) => u.public_id === p_public_id && !u.is_banned);
      if (!s) throw err('not_found');
      return {
        public_id: s.public_id,
        name: s.first_name,
        verified: s.is_verified_seller,
        member_since: s.created_at,
        city: s.city,
        rating: rating(s.telegram_id),
        sold_count: db.products.filter((p) => p.seller_id === s.telegram_id && p.status === 'sold').length,
        listings: publicList().filter((p) => p.seller_id === s.telegram_id).map(card),
        reviews: db.reviews
          .filter((r) => r.seller_id === s.telegram_id)
          .slice(0, 20)
          .map((r) => ({
            rating: r.rating,
            comment: r.comment,
            created_at: r.created_at,
            reviewer_name: userById(r.reviewer_id)?.first_name ?? '',
          })),
      };
    },
    get_public_settings() {
      const s = db.settings;
      return {
        listing_fee_etb: s.listing_fee_etb,
        free_listings_quota: s.free_listings_quota,
        listing_duration_days: s.listing_duration_days,
        max_active_listings: s.max_active_listings,
        boost_price_etb: s.boost_price_etb,
        boost_days: s.boost_days,
        payment_sla_minutes: s.payment_sla_minutes,
        contact_daily_limit: s.contact_daily_limit,
        telebirr_number: s.telebirr_number,
        telebirr_name: s.telebirr_name,
        support_username: s.support_username,
        bot_username: s.bot_username,
        mini_app_short_name: s.mini_app_short_name,
      };
    },
    price_hint({ p_category, p_brand }) {
      const m = median(p_category, p_brand ?? '');
      return { median: m, low: m === null ? null : Math.round(m * 0.25), high: m === null ? null : Math.round(m * 4) };
    },

    // ─── account ──────────────────────────────────────────────────────
    get_me() {
      return meJson(requireUser(true));
    },
    update_my_profile({ p_input }) {
      const u = requireUser(true);
      if (p_input.city !== undefined) u.city = p_input.city.trim().slice(0, 40);
      if (p_input.language !== undefined) u.language = p_input.language;
      return meJson(u);
    },

    // ─── buyer ────────────────────────────────────────────────────────
    register_view({ p_id }) {
      const p = db.products.find((x) => x.id === p_id);
      if (p && isPublic(p) && meId() && meId() !== p.seller_id) p.views += 1;
      return null;
    },
    toggle_favorite({ p_id }) {
      const u = requireUser(true);
      const i = db.favorites.findIndex((f) => f.telegram_id === u.telegram_id && f.product_id === p_id);
      if (i >= 0) {
        db.favorites.splice(i, 1);
        return false;
      }
      if (!isPublic(product(p_id))) throw err('listing_not_active');
      db.favorites.unshift({ telegram_id: u.telegram_id, product_id: p_id, created_at: now() });
      return true;
    },
    my_favorites() {
      const u = requireUser(true);
      return db.favorites
        .filter((f) => f.telegram_id === u.telegram_id)
        .map((f) => {
          const p = product(f.product_id);
          const available = isPublic(p);
          return { ...card(p), available, status: available ? 'active' : p.status === 'sold' ? 'sold' : 'unavailable' };
        });
    },
    request_contact({ p_id }) {
      const u = requireUser();
      if (!u.phone_verified) throw err('phone_not_verified');
      const p = product(p_id);
      if (!isPublic(p)) throw err('listing_not_active');
      if (p.seller_id === u.telegram_id) throw err('own_listing');
      const since = new Date(Date.now() - DAY).toISOString();
      const recent = db.leads.some((l) => l.product_id === p_id && l.buyer_id === u.telegram_id && l.created_at > since);
      if (!recent) {
        if (db.leads.filter((l) => l.buyer_id === u.telegram_id && l.created_at > since).length >= db.settings.contact_daily_limit) {
          throw err('rate_limited');
        }
        db.leads.unshift({ product_id: p_id, buyer_id: u.telegram_id, seller_id: p.seller_id, created_at: now() });
      }
      const s = userById(p.seller_id);
      return {
        username: s?.username || null,
        telegram_url: s?.username ? `https://t.me/${s.username}` : null,
        phone: !s?.username && s?.phone_verified ? s.phone : null,
        seller_name: s?.first_name ?? '',
      };
    },
    submit_report({ p_target_type, p_target_id, p_reason, p_note }) {
      const u = requireUser();
      let target = p_target_id;
      if (p_target_type === 'product') {
        const p = db.products.find((x) => x.id === p_target_id);
        if (!p || p.seller_id === u.telegram_id) throw err('not_found');
      } else {
        const t = db.users.find((x) => x.public_id === p_target_id);
        if (!t || t.telegram_id === u.telegram_id) throw err('not_found');
        target = t.telegram_id;
      }
      const existing = db.reports.find(
        (r) => r.reporter_id === u.telegram_id && r.target_type === p_target_type && r.target_id === target && r.status === 'open',
      );
      if (existing) return existing.id;
      const id = uuid();
      db.reports.unshift({
        id,
        reporter_id: u.telegram_id,
        target_type: p_target_type,
        target_id: target,
        reason: p_reason,
        note: (p_note ?? '').slice(0, 500),
        status: 'open',
        resolution: '',
        created_at: now(),
      });
      return id;
    },
    submit_review({ p_product_id, p_rating, p_comment }) {
      const u = requireUser();
      const p = product(p_product_id);
      if (p.status !== 'sold' || p.seller_id === u.telegram_id || !db.leads.some((l) => l.product_id === p.id && l.buyer_id === u.telegram_id)) {
        throw err('not_reviewable');
      }
      if (db.reviews.some((r) => r.product_id === p.id && r.reviewer_id === u.telegram_id)) throw err('already_reviewed');
      if (!(p_rating >= 1 && p_rating <= 5)) throw err('invalid_input', 'rating');
      db.reviews.unshift({
        seller_id: p.seller_id,
        reviewer_id: u.telegram_id,
        product_id: p.id,
        rating: p_rating,
        comment: (p_comment ?? '').trim().slice(0, 500),
        created_at: now(),
      });
      return uuid();
    },

    // ─── seller ───────────────────────────────────────────────────────
    my_listings() {
      const u = requireUser(true);
      return db.products
        .filter((p) => p.seller_id === u.telegram_id)
        .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((p): MyListing => {
          const open = db.payments.find((x) => x.product_id === p.id && (x.status === 'pending' || x.status === 'submitted'));
          return {
            id: p.id,
            title: p.title,
            price: p.price,
            category: p.category,
            brand: p.brand,
            model: p.model,
            condition: p.condition,
            city: p.city,
            status: p.status,
            reject_reason: p.reject_reason,
            reject_note: p.reject_note,
            flags: p.flags,
            is_free: p.is_free,
            renew_count: p.renew_count,
            published_at: p.published_at,
            expires_at: p.expires_at,
            updated_at: p.updated_at,
            is_featured: featured(p),
            boosted_until: p.boosted_until,
            cover_path: cover(p),
            views: p.views,
            favorites_count: db.favorites.filter((f) => f.product_id === p.id).length,
            leads_count: db.leads.filter((l) => l.product_id === p.id).length,
            open_payment: open ? { id: open.id, kind: open.kind, status: open.status, amount_etb: open.amount_etb } : null,
          };
        });
    },
    get_my_listing({ p_id }) {
      const p = ownProduct(p_id, requireUser(true));
      return {
        id: p.id,
        title: p.title,
        description: p.description,
        price: p.price,
        category: p.category,
        brand: p.brand,
        model: p.model,
        condition: p.condition,
        city: p.city,
        specs: p.specs,
        negotiable: p.negotiable,
        exchange: p.exchange,
        status: p.status,
        reject_reason: p.reject_reason,
        reject_note: p.reject_note,
        published_at: p.published_at,
        is_free: p.is_free,
        period_paid: p.period_paid,
        images: p.images,
        missing: missing(p),
      };
    },
    create_listing({ p_input }) {
      const u = requireUser();
      const p: MockProduct = {
        id: uuid(),
        seller_id: u.telegram_id,
        title: '',
        description: '',
        price: null,
        category: null,
        brand: '',
        model: '',
        condition: null,
        city: u.city,
        specs: {},
        negotiable: false,
        exchange: false,
        status: 'draft',
        is_free: false,
        period_paid: false,
        reject_reason: null,
        reject_note: '',
        flags: [],
        renew_count: 0,
        views: 0,
        expires_at: null,
        boosted_until: null,
        published_at: null,
        status_changed_at: now(),
        created_at: now(),
        updated_at: now(),
        images: [],
      };
      applyInput(p, p_input);
      db.products.unshift(p);
      return p.id;
    },
    update_listing({ p_id, p_input }) {
      const u = requireUser();
      const p = ownProduct(p_id, u);
      if (!['draft', 'rejected', 'pending_payment', 'active', 'paused', 'expired'].includes(p.status)) throw err('listing_locked');
      const before = { ...p };
      applyInput(p, p_input);
      const substantive = (['title', 'description', 'category', 'brand', 'model', 'condition'] as const).some(
        (k) => before[k] !== p[k],
      ) || JSON.stringify(before.specs) !== JSON.stringify(p.specs);
      const live = before.status === 'active' || before.status === 'paused';
      if (live && substantive) {
        if (bannedWord(`${p.title} ${p.description}`)) {
          Object.assign(p, before);
          throw err('banned_words');
        }
        p.flags = computeFlags(p);
        setStatus(p, 'in_review');
      }
      return { status: p.status, needs_review: live && substantive };
    },
    set_listing_images({ p_id, p_images }) {
      const u = requireUser();
      const p = ownProduct(p_id, u);
      if (!['draft', 'rejected', 'pending_payment', 'active', 'paused', 'expired'].includes(p.status)) throw err('listing_locked');
      if (p_images.length > 8) throw err('invalid_input', 'images');
      const prefix = `${u.telegram_id}/${p.id}/`;
      if (p_images.some((i) => !i.path.startsWith(prefix) && !i.path.startsWith('mock/'))) throw err('invalid_input', 'image_path');
      const changed = JSON.stringify(p.images.map((i) => i.path)) !== JSON.stringify(p_images.map((i) => i.path));
      p.images = p_images;
      p.updated_at = now();
      if ((p.status === 'active' || p.status === 'paused') && changed) {
        p.flags = computeFlags(p);
        setStatus(p, 'in_review');
      }
      return { count: p.images.length, status: p.status };
    },
    submit_listing({ p_id }) {
      const u = requireUser();
      const p = ownProduct(p_id, u);
      if (!u.phone_verified) throw err('phone_not_verified');
      if (p.status !== 'draft' && p.status !== 'rejected') throw err('illegal_transition');
      const m = missing(p);
      if (m.length) throw err('listing_incomplete', m.join(','));
      if (bannedWord(`${p.title} ${p.description} ${p.brand} ${p.model}`)) throw err('banned_words');
      if (openListings(u.telegram_id, p.id) >= db.settings.max_active_listings) {
        throw err('max_active_listings', String(db.settings.max_active_listings));
      }
      const d = decideSubmission({
        feeEtb: db.settings.listing_fee_etb,
        freeQuota: db.settings.free_listings_quota,
        freeUsed: u.listings_free_used,
        isFree: p.is_free,
        periodPaid: p.period_paid,
        publishedAt: p.published_at,
      });
      if (d.consumesQuota) u.listings_free_used += 1;
      p.flags = computeFlags(p);
      p.reject_reason = null;
      p.reject_note = '';
      p.is_free = p.is_free || d.free;
      p.period_paid = p.period_paid || d.free;
      setStatus(p, d.status);
      let paymentId: string | null = null;
      if (d.status === 'pending_payment') {
        paymentId = ensureOpenPayment(p, p.published_at ? 'renew' : 'listing', db.settings.listing_fee_etb).id;
      }
      return { status: p.status, is_free: d.free, payment_id: paymentId, amount_etb: paymentId ? db.settings.listing_fee_etb : null };
    },
    set_listing_status({ p_id, p_status }) {
      const u = requireUser(true);
      const p = ownProduct(p_id, u);
      if (p_status === 'paused' && p.status === 'active') setStatus(p, 'paused');
      else if (p_status === 'active' && p.status === 'paused') {
        if (u.is_banned) throw err('banned');
        if (p.expires_at && p.expires_at <= now()) {
          setStatus(p, 'expired');
          return 'expired';
        }
        setStatus(p, 'active');
      } else if (p_status === 'sold' && (p.status === 'active' || p.status === 'paused')) {
        p.boosted_until = null;
        setStatus(p, 'sold');
      } else throw err('illegal_transition');
      return p_status;
    },
    renew_listing({ p_id }) {
      const u = requireUser();
      const p = ownProduct(p_id, u);
      if (p.status !== 'expired') throw err('illegal_transition');
      if (openListings(u.telegram_id, p.id) >= db.settings.max_active_listings) throw err('max_active_listings');
      const d = decideRenewal(p.renew_count, db.settings.listing_fee_etb);
      p.renew_count += 1;
      p.is_free = d.free;
      p.period_paid = d.free;
      p.expires_at = null;
      p.flags = computeFlags(p);
      setStatus(p, d.status);
      const pay = d.free ? null : ensureOpenPayment(p, 'renew', db.settings.listing_fee_etb);
      return { status: p.status, is_free: d.free, payment_id: pay?.id ?? null, amount_etb: pay ? pay.amount_etb : null };
    },
    delete_listing({ p_id }) {
      const u = requireUser(true);
      const p = ownProduct(p_id, u);
      if (!['draft', 'rejected', 'pending_payment'].includes(p.status) || p.published_at) throw err('listing_locked');
      if (db.payments.some((x) => x.product_id === p.id && x.status !== 'pending')) throw err('listing_locked');
      if (p.is_free) u.listings_free_used = Math.max(u.listings_free_used - 1, 0);
      db.products = db.products.filter((x) => x.id !== p.id);
      db.payments = db.payments.filter((x) => x.product_id !== p.id);
      return { deleted: true, paths: p.images.map((i) => i.path) };
    },
    create_boost_payment({ p_id }) {
      const p = ownProduct(p_id, requireUser());
      if (p.status !== 'active') throw err('listing_not_active');
      const pay = ensureOpenPayment(p, 'boost', db.settings.boost_price_etb);
      return { payment_id: pay.id, amount_etb: pay.amount_etb };
    },

    // ─── payments ─────────────────────────────────────────────────────
    get_payment({ p_id }) {
      const u = requireUser(true);
      const pay = db.payments.find((x) => x.id === p_id);
      if (!pay || (pay.telegram_id !== u.telegram_id && u.role === 'user')) throw err('not_found');
      return {
        ...paymentJson(pay),
        pay_to: { telebirr_number: db.settings.telebirr_number, telebirr_name: db.settings.telebirr_name },
        sla_minutes: db.settings.payment_sla_minutes,
      };
    },
    submit_payment_reference({ p_payment_id, p_reference, p_screenshot_path }) {
      const u = requireUser();
      const pay = db.payments.find((x) => x.id === p_payment_id);
      if (!pay || pay.telegram_id !== u.telegram_id) throw err('not_found');
      const ref = normalizeReference(p_reference);
      if (!/^[A-Z0-9-]{6,32}$/.test(ref)) throw err('invalid_reference_format');
      if (pay.status === 'submitted' && pay.reference === ref) return paymentJson(pay);
      if (pay.status !== 'pending') throw err('illegal_transition');
      if (db.payments.some((x) => x.id !== pay.id && x.reference === ref && ['submitted', 'confirmed', 'refunded'].includes(x.status))) {
        throw err('duplicate_reference');
      }
      const p = product(pay.product_id);
      if (pay.kind !== 'boost' && p.status !== 'pending_payment') throw err('illegal_transition');
      if (pay.kind === 'boost' && p.status !== 'active') throw err('listing_not_active');
      Object.assign(pay, { reference: ref, screenshot_path: p_screenshot_path ?? '', status: 'submitted', submitted_at: now() });
      if (pay.kind !== 'boost') setStatus(p, 'payment_submitted');
      return paymentJson(pay);
    },

    // ─── staff ────────────────────────────────────────────────────────
    admin_dashboard() {
      const u = requireStaff();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const inReview = db.products.filter((p) => p.status === 'in_review');
      const base = {
        role: u.role,
        in_review: inReview.length,
        oldest_in_review_at: inReview.map((p) => p.status_changed_at).sort()[0] ?? null,
        open_reports: db.reports.filter((r) => r.status === 'open').length,
        new_listings_today: db.products.filter((p) => p.published_at && p.published_at >= today.toISOString()).length,
        live_listings: publicList().length,
      };
      if (u.role !== 'admin') return base;
      const waiting = db.payments.filter((x) => x.status === 'submitted');
      const revenue = (days: number) => {
        const since = new Date(Date.now() - days * DAY).toISOString();
        return db.payments
          .filter((x) => (x.status === 'confirmed' || x.status === 'refunded') && (x.reviewed_at ?? '') > since)
          .reduce((s, x) => s + x.amount_etb, 0) -
          db.payments.filter((x) => (x.refunded_at ?? '') > since).reduce((s, x) => s + x.amount_etb, 0);
      };
      const recent = db.products.filter((p) => p.created_at > new Date(Date.now() - 30 * DAY).toISOString());
      const cats = new Map<Category, number>();
      for (const p of publicList()) if (p.category) cats.set(p.category, (cats.get(p.category) ?? 0) + 1);
      return {
        ...base,
        payments_waiting: waiting.length,
        oldest_payment_at: waiting.map((x) => x.submitted_at ?? '').sort()[0] ?? null,
        sla_minutes: db.settings.payment_sla_minutes,
        revenue_7d: revenue(7),
        revenue_30d: revenue(30),
        revenue_by_day: Array.from({ length: 14 }, (_, i) => {
          const d = new Date(today.getTime() - (13 - i) * DAY);
          const key = d.toISOString().slice(0, 10);
          return {
            day: key,
            amount: db.payments
              .filter((x) => (x.status === 'confirmed' || x.status === 'refunded') && (x.reviewed_at ?? '').slice(0, 10) === key)
              .reduce((s, x) => s + x.amount_etb, 0),
          };
        }),
        funnel_30d: {
          created: recent.length,
          submitted: recent.filter((p) => p.status !== 'draft').length,
          paid: recent.filter((p) => p.period_paid).length,
          live: recent.filter((p) => p.published_at).length,
        },
        top_categories: [...cats.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([category, count]) => ({ category, count })),
        users_total: db.users.length,
        users_today: 0,
        outbox_failed: 0,
      };
    },
    admin_review_queue() {
      requireStaff();
      return db.products
        .filter((p) => p.status === 'in_review')
        .sort((a, b) => a.status_changed_at.localeCompare(b.status_changed_at))
        .map((p) => {
          const s = userById(p.seller_id);
          if (!s) throw err('not_found');
          return {
            id: p.id,
            title: p.title,
            description: p.description,
            price: p.price,
            category: p.category,
            brand: p.brand,
            model: p.model,
            condition: p.condition,
            city: p.city,
            specs: p.specs,
            negotiable: p.negotiable,
            exchange: p.exchange,
            flags: p.flags,
            is_free: p.is_free,
            waiting_since: p.status_changed_at,
            was_live: p.published_at !== null,
            median_price: p.category ? median(p.category, p.brand, p.id) : null,
            images: p.images.map((i) => i.path),
            seller: {
              public_id: s.public_id,
              name: s.first_name,
              username: s.username,
              verified: s.is_verified_seller,
              member_since: s.created_at,
              phone_verified: s.phone_verified,
              rating: rating(s.telegram_id),
              live_count: db.products.filter((x) => x.seller_id === s.telegram_id && x.status === 'active').length,
              sold_count: db.products.filter((x) => x.seller_id === s.telegram_id && x.status === 'sold').length,
              past_rejections: db.audit.filter(
                (a) =>
                  (a.action === 'listing.reject' || a.action === 'listing.remove') &&
                  db.products.some((x) => x.id === a.target_id && x.seller_id === s.telegram_id),
              ).length,
              open_reports: db.reports.filter((r) => r.status === 'open' && r.target_type === 'user' && r.target_id === s.telegram_id).length,
            },
          };
        });
    },
    moderate_listing({ p_id, p_approve, p_reason, p_note }) {
      requireStaff();
      const p = product(p_id);
      if (p.status !== 'in_review') throw err('illegal_transition');
      if (p_approve) {
        if (!p.period_paid) throw err('payment_required');
        goLive(p);
      } else {
        if (!p_reason) throw err('reason_required');
        p.reject_reason = p_reason;
        p.reject_note = (p_note ?? '').slice(0, 500);
        setStatus(p, 'rejected');
      }
      audit(p_approve ? 'listing.approve' : 'listing.reject', 'product', p.id, { status: 'in_review' }, { status: p.status });
      return p.status;
    },
    admin_remove_listing({ p_id, p_reason, p_note }) {
      requireStaff();
      const p = product(p_id);
      if (['draft', 'sold', 'removed'].includes(p.status)) throw err('illegal_transition');
      const before = p.status;
      p.reject_reason = p_reason;
      p.reject_note = p_note ?? '';
      p.boosted_until = null;
      setStatus(p, 'removed');
      audit('listing.remove', 'product', p.id, { status: before }, { status: 'removed', reject_reason: p_reason });
      return 'removed';
    },
    admin_list_listings({ p_status, p_search }) {
      requireStaff();
      const q = (p_search ?? '').toLowerCase();
      return db.products
        .filter((p) => (!p_status || p_status === 'all' || p.status === p_status) && (!q || p.title.toLowerCase().includes(q)))
        .slice(0, 100)
        .map((p) => {
          const s = userById(p.seller_id);
          return {
            id: p.id,
            title: p.title,
            price: p.price,
            status: p.status,
            category: p.category,
            city: p.city,
            flags: p.flags,
            views: p.views,
            updated_at: p.updated_at,
            published_at: p.published_at,
            expires_at: p.expires_at,
            cover_path: cover(p),
            seller: { name: s?.first_name ?? '', username: s?.username ?? '', public_id: s?.public_id ?? '' },
          };
        });
    },
    admin_list_reports({ p_status }) {
      requireStaff();
      return db.reports
        .filter((r) => !p_status || p_status === 'all' || r.status === p_status)
        .map((r) => {
          const p = r.target_type === 'product' ? db.products.find((x) => x.id === r.target_id) : undefined;
          const ps = p ? userById(p.seller_id) : undefined;
          const tu = r.target_type === 'user' ? userById(r.target_id) : ps;
          return {
            id: r.id,
            target_type: r.target_type,
            reason: r.reason,
            note: r.note,
            status: r.status,
            resolution: r.resolution,
            created_at: r.created_at,
            reporter_name: userById(r.reporter_id)?.first_name ?? '',
            same_target_open: db.reports.filter((o) => o.target_id === r.target_id && o.status === 'open').length,
            product: p
              ? {
                  id: p.id,
                  title: p.title,
                  price: p.price,
                  status: p.status,
                  cover_path: cover(p),
                  seller_name: ps?.first_name ?? '',
                  seller_public_id: ps?.public_id ?? '',
                }
              : null,
            user: tu ? { public_id: tu.public_id, name: tu.first_name, username: tu.username, is_banned: tu.is_banned } : null,
          };
        });
    },
    resolve_report({ p_id, p_action, p_note }) {
      const staff = requireStaff();
      const r = db.reports.find((x) => x.id === p_id);
      if (!r) throw err('not_found');
      if (r.status !== 'open') throw err('illegal_transition');
      const same = db.reports.filter((o) => o.target_type === r.target_type && o.target_id === r.target_id && o.status === 'open');
      if (p_action === 'dismiss') same.forEach((o) => Object.assign(o, { status: 'dismissed', resolution: p_note ?? '' }));
      else if (p_action === 'remove_listing' && r.target_type === 'product') {
        const p = product(r.target_id);
        if (!['draft', 'sold', 'removed'].includes(p.status)) setStatus(p, 'removed');
        same.forEach((o) => Object.assign(o, { status: 'actioned', resolution: 'listing_removed' }));
      } else if (p_action === 'ban_user') {
        if (staff.role !== 'admin') throw err('not_authorized');
        const target = r.target_type === 'user' ? r.target_id : product(r.target_id).seller_id;
        const tu = userById(target);
        if (!tu) throw err('not_found');
        if (tu.role === 'admin') throw err('cannot_ban_admin');
        tu.is_banned = true;
        tu.ban_reason = p_note || `report:${r.reason}`;
        same.forEach((o) => Object.assign(o, { status: 'actioned', resolution: 'user_banned' }));
      } else throw err('invalid_input', 'action');
      audit(`report.${p_action}`, 'report', r.id, null, { status: r.status });
      return p_action;
    },

    // ─── admin ────────────────────────────────────────────────────────
    admin_list_payments({ p_status, p_search }) {
      requireAdmin();
      const q = (p_search ?? '').toLowerCase();
      return db.payments
        .filter((x) => !p_status || p_status === 'all' || x.status === p_status)
        .map((x): AdminPayment => {
          const p = product(x.product_id);
          const s = userById(x.telegram_id);
          return {
            ...paymentJson(x),
            duplicate_count: db.payments.filter((o) => o.id !== x.id && o.reference && o.reference === x.reference).length,
            product: { id: p.id, title: p.title, price: p.price, status: p.status, category: p.category, cover_path: cover(p) },
            seller: { name: s?.first_name ?? '', username: s?.username ?? '', public_id: s?.public_id ?? '', verified: s?.is_verified_seller ?? false },
          };
        })
        .filter(
          (x) =>
            !q ||
            x.reference.toLowerCase().includes(q) ||
            x.product.title.toLowerCase().includes(q) ||
            x.seller.username.toLowerCase().includes(q) ||
            x.seller.name.toLowerCase().includes(q),
        )
        .sort((a, b) =>
          a.status === 'submitted' && b.status === 'submitted'
            ? (a.submitted_at ?? '').localeCompare(b.submitted_at ?? '')
            : (b.reviewed_at ?? b.created_at).localeCompare(a.reviewed_at ?? a.created_at),
        );
    },
    admin_confirm_payment({ p_id, p_note }) {
      const admin = requireAdmin();
      const pay = db.payments.find((x) => x.id === p_id);
      if (!pay) throw err('not_found');
      if (pay.status !== 'submitted') throw err('illegal_transition');
      const p = product(pay.product_id);
      const before = { ...pay };
      Object.assign(pay, { status: 'confirmed', reviewed_at: now(), admin_note: p_note ?? '' });
      if (pay.kind === 'boost') {
        const start = p.boosted_until && p.boosted_until > now() ? Date.parse(p.boosted_until) : Date.now();
        p.boosted_until = new Date(start + db.settings.boost_days * DAY).toISOString();
      } else {
        if (p.status !== 'payment_submitted') throw err('illegal_transition');
        p.period_paid = true;
        p.flags = computeFlags(p);
        if (p.flags.length === 0) goLive(p);
        else setStatus(p, 'in_review');
      }
      audit('payment.confirm', 'payment', pay.id, before, { ...pay, reviewed_by: admin.telegram_id });
      return paymentJson(pay);
    },
    admin_reject_payment({ p_id, p_reason, p_note }) {
      requireAdmin();
      if (!p_reason) throw err('reason_required');
      const pay = db.payments.find((x) => x.id === p_id);
      if (!pay) throw err('not_found');
      if (pay.status !== 'submitted') throw err('illegal_transition');
      const before = { ...pay };
      Object.assign(pay, { status: 'rejected', reject_reason: p_reason, admin_note: p_note ?? '', reviewed_at: now() });
      const p = product(pay.product_id);
      if (pay.kind !== 'boost' && p.status === 'payment_submitted') {
        p.reject_reason = p_reason;
        p.reject_note = p_note ?? '';
        setStatus(p, 'rejected');
      }
      audit('payment.reject', 'payment', pay.id, before, pay);
      return paymentJson(pay);
    },
    admin_refund_payment({ p_id, p_note }) {
      requireAdmin();
      const pay = db.payments.find((x) => x.id === p_id);
      if (!pay) throw err('not_found');
      if (pay.status !== 'confirmed') throw err('illegal_transition');
      const before = { ...pay };
      Object.assign(pay, { status: 'refunded', refunded_at: now(), admin_note: p_note ?? '' });
      const p = product(pay.product_id);
      if (pay.kind === 'boost') p.boosted_until = null;
      else if (!['sold', 'removed'].includes(p.status)) setStatus(p, 'removed');
      audit('payment.refund', 'payment', pay.id, before, pay);
      return paymentJson(pay);
    },
    admin_list_users({ p_search, p_filter }) {
      requireAdmin();
      const q = (p_search ?? '').toLowerCase().replace('@', '');
      return db.users
        .filter(
          (u) =>
            (!q || u.username.toLowerCase().includes(q) || u.first_name.toLowerCase().includes(q) || u.telegram_id === q) &&
            (!p_filter ||
              p_filter === 'all' ||
              (p_filter === 'banned' && u.is_banned) ||
              (p_filter === 'staff' && u.role !== 'user') ||
              (p_filter === 'verified' && u.is_verified_seller)),
        )
        .map(adminUser);
    },
    admin_get_user({ p_public_id }) {
      requireAdmin();
      const u = db.users.find((x) => x.public_id === p_public_id);
      if (!u) throw err('not_found');
      return {
        ...adminUser(u),
        listings: db.products
          .filter((p) => p.seller_id === u.telegram_id)
          .map((p) => ({ id: p.id, title: p.title, price: p.price, status: p.status, updated_at: p.updated_at })),
        payments: db.payments
          .filter((x) => x.telegram_id === u.telegram_id)
          .map((x) => ({ id: x.id, kind: x.kind, status: x.status, amount_etb: x.amount_etb, reference: x.reference, created_at: x.created_at })),
        reports_against: db.reports.filter((r) => r.target_id === u.telegram_id).length,
        reports_filed: db.reports.filter((r) => r.reporter_id === u.telegram_id).length,
      };
    },
    admin_set_ban({ p_public_id, p_banned, p_reason }) {
      const admin = requireAdmin();
      const u = db.users.find((x) => x.public_id === p_public_id);
      if (!u) throw err('not_found');
      if (u.telegram_id === admin.telegram_id) throw err('cannot_target_self');
      if (u.role === 'admin' && p_banned) throw err('cannot_ban_admin');
      if (p_banned && !(p_reason ?? '').trim()) throw err('reason_required');
      audit(p_banned ? 'user.ban' : 'user.unban', 'user', u.telegram_id, { is_banned: u.is_banned }, { is_banned: p_banned });
      u.is_banned = p_banned;
      u.ban_reason = p_banned ? (p_reason ?? '') : '';
      return adminUser(u);
    },
    admin_set_role({ p_public_id, p_role }) {
      const admin = requireAdmin();
      const u = db.users.find((x) => x.public_id === p_public_id);
      if (!u) throw err('not_found');
      if (u.telegram_id === admin.telegram_id) throw err('cannot_target_self');
      if (u.is_banned && p_role !== 'user') throw err('user_banned');
      audit('user.set_role', 'user', u.telegram_id, { role: u.role }, { role: p_role });
      u.role = p_role;
      return adminUser(u);
    },
    admin_set_verified({ p_public_id, p_verified }) {
      requireAdmin();
      const u = db.users.find((x) => x.public_id === p_public_id);
      if (!u) throw err('not_found');
      audit('user.set_verified', 'user', u.telegram_id, { is_verified_seller: u.is_verified_seller }, { is_verified_seller: p_verified });
      u.is_verified_seller = p_verified;
      return adminUser(u);
    },
    admin_get_settings() {
      requireAdmin();
      return { ...db.settings };
    },
    admin_update_settings({ p_input }) {
      const admin = requireAdmin();
      const before = { ...db.settings };
      const next = { ...db.settings, ...p_input, updated_at: now(), updated_by: admin.telegram_id };
      if (next.free_listings_quota < 0 || next.listing_duration_days < 1 || next.listing_fee_etb < 0) throw err('invalid_input');
      next.support_username = next.support_username.replace(/^@/, '');
      next.bot_username = next.bot_username.replace(/^@/, '');
      next.banned_words = [...new Set(next.banned_words.map((w) => w.trim().toLowerCase()).filter(Boolean))];
      db.settings = next;
      audit('settings.update', 'settings', '1', before, next);
      return { ...db.settings };
    },
    admin_audit_log({ p_action, p_target_type }) {
      requireAdmin();
      return db.audit.filter(
        (a) => (!p_action || a.action.startsWith(p_action)) && (!p_target_type || a.target_type === p_target_type),
      );
    },
  };

  return {
    kind: 'mock',

    async rpc<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>> {
      await new Promise((r) => setTimeout(r, 120)); // make loading states visible in dev
      const handler = handlers[name] as (a: RpcArgs<K>) => RpcMap[K][1];
      // Work on a copy so a failed call leaves the store untouched (like a DB transaction).
      const snapshot = JSON.stringify(db);
      try {
        const result = handler(args);
        save();
        return structuredClone(result);
      } catch (e) {
        Object.assign(db, JSON.parse(snapshot) as MockDb);
        throw e;
      }
    },

    async fn<K extends FnName>(name: K, body: FnMap[K][0]): Promise<FnMap[K][1]> {
      await new Promise((r) => setTimeout(r, 80));
      if (name === 'auth-telegram') {
        let id = '1001';
        try {
          id = window.localStorage.getItem(MOCK_USER_KEY) ?? '1001';
        } catch {
          /* default user */
        }
        if (!userById(id)) id = '1001';
        currentToken = `mock.${id}`;
        return { access_token: currentToken, expires_at: Math.floor(Date.now() / 1000) + 12 * 3600 } as FnMap[K][1];
      }
      if (name === 'verify-phone') {
        const u = requireUser(true);
        u.phone = '+251900000000';
        u.phone_verified = true;
        save();
        return { phone_verified: true } as FnMap[K][1];
      }
      const b = body as FnMap['storage'][0];
      const u = requireUser();
      if (b.action === 'listing-image') {
        if (!db.products.some((p) => p.id === b.product_id && p.seller_id === u.telegram_id)) throw err('not_found');
        const path = `${u.telegram_id}/${b.product_id}/${uuid().slice(0, 12)}.${b.ext}`;
        return { path, token: 'mock', signed_url: '' } as FnMap[K][1];
      }
      if (b.action === 'payment-proof') {
        return { path: `${u.telegram_id}/${uuid()}.${b.ext}`, token: 'mock', signed_url: '' } as FnMap[K][1];
      }
      return { url: '' } as FnMap[K][1];
    },

    async uploadToSignedUrl(_bucket, path, _token, file) {
      uploads.set(path, URL.createObjectURL(file));
    },

    imageUrl(path) {
      return uploads.get(path) ?? mockImageDataUrl(path);
    },
  };
}
