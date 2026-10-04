/**
 * Domain types mirroring the JSON returned by the database RPCs (supabase/migrations/04xx–07xx).
 * Keep in sync with the SQL; the mock backend implements the same contract.
 */

export const CATEGORIES = ['phone', 'laptop', 'tablet', 'desktop', 'watch', 'audio', 'accessory', 'other'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'for_parts'] as const;
export type Condition = (typeof CONDITIONS)[number];

export const LISTING_STATUSES = [
  'draft',
  'pending_payment',
  'payment_submitted',
  'in_review',
  'active',
  'paused',
  'sold',
  'expired',
  'rejected',
  'removed',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export type PaymentStatus = 'pending' | 'submitted' | 'confirmed' | 'rejected' | 'refunded';
export type PaymentKind = 'listing' | 'boost' | 'renew';
export type Role = 'user' | 'moderator' | 'admin';
export type Language = 'en' | 'am';

export const LISTING_REJECT_REASONS = ['prohibited_item', 'bad_photos', 'misleading_price', 'duplicate', 'other'] as const;
export const PAYMENT_REJECT_REASONS = ['invalid_reference', 'wrong_amount', 'duplicate', 'other'] as const;
export type ListingRejectReason = (typeof LISTING_REJECT_REASONS)[number];
export type PaymentRejectReason = (typeof PAYMENT_REJECT_REASONS)[number];
export type RejectReason = ListingRejectReason | PaymentRejectReason;

export const REPORT_REASONS = ['scam', 'prohibited', 'wrong_info', 'duplicate', 'offensive', 'already_sold', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ListingFlag = 'price_low' | 'price_high' | 'duplicate_image';
export type Specs = Record<string, string | number | boolean>;
export type SortOption = 'newest' | 'price_asc' | 'price_desc';

export interface Rating {
  rating: number | null;
  count: number;
}

export interface ListingCard {
  id: string;
  title: string;
  price: number | null;
  category: Category | null;
  brand: string;
  model: string;
  condition: Condition | null;
  city: string;
  negotiable: boolean;
  exchange: boolean;
  is_featured: boolean;
  published_at: string | null;
  cover_path: string | null;
  seller_verified: boolean;
}

export interface SearchResult {
  items: ListingCard[];
  total: number;
  next_offset: number | null;
}

export interface HomeFeed {
  featured: ListingCard[];
  newest: ListingCard[];
  near_you: ListingCard[];
  under_20k: ListingCard[];
  category_counts: Partial<Record<Category, number>>;
}

export interface SellerCard {
  public_id: string;
  name: string;
  verified: boolean;
  member_since: string;
  rating: Rating;
  active_count: number;
}

export interface PaymentRef {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_etb: number;
}

export interface ListingManage {
  status: ListingStatus;
  reject_reason: RejectReason | null;
  reject_note: string;
  flags: ListingFlag[];
  is_free: boolean;
  period_paid: boolean;
  renew_count: number;
  boosted_until: string | null;
  leads_count: number;
  open_payment: PaymentRef | null;
  last_payment: (PaymentRef & { reject_reason: PaymentRejectReason | null; admin_note: string }) | null;
}

export interface ListingDetail {
  id: string;
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
  published_at: string | null;
  expires_at: string | null;
  is_featured: boolean;
  views: number;
  images: string[];
  favorites_count: number;
  is_owner: boolean;
  is_favorite: boolean;
  can_review: boolean;
  seller: SellerCard;
  manage?: ListingManage;
}

export interface MyListing {
  id: string;
  title: string;
  price: number | null;
  category: Category | null;
  brand: string;
  model: string;
  condition: Condition | null;
  city: string;
  status: ListingStatus;
  reject_reason: RejectReason | null;
  reject_note: string;
  flags: ListingFlag[];
  is_free: boolean;
  renew_count: number;
  published_at: string | null;
  expires_at: string | null;
  updated_at: string;
  is_featured: boolean;
  boosted_until: string | null;
  cover_path: string | null;
  views: number;
  favorites_count: number;
  leads_count: number;
  open_payment: PaymentRef | null;
}

export interface ListingImage {
  path: string;
  hash: string;
}

export interface DraftListing {
  id: string;
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
  reject_reason: RejectReason | null;
  reject_note: string;
  published_at: string | null;
  is_free: boolean;
  period_paid: boolean;
  images: ListingImage[];
  missing: string[];
}

export interface ListingInput {
  title?: string;
  description?: string;
  price?: number | null;
  category?: Category | null;
  brand?: string;
  model?: string;
  condition?: Condition | null;
  city?: string;
  specs?: Specs;
  negotiable?: boolean;
  exchange?: boolean;
}

export interface SubmitResult {
  status: ListingStatus;
  is_free: boolean;
  payment_id: string | null;
  amount_etb: number | null;
}

export interface FavoriteItem extends ListingCard {
  available: boolean;
  status: 'active' | 'sold' | 'unavailable';
}

export interface ContactResult {
  username: string | null;
  telegram_url: string | null;
  phone: string | null;
  seller_name: string;
}

export interface SellerProfile {
  public_id: string;
  name: string;
  verified: boolean;
  member_since: string;
  city: string;
  rating: Rating;
  sold_count: number;
  listings: ListingCard[];
  reviews: Array<{ rating: number; comment: string; created_at: string; reviewer_name: string }>;
}

export interface Me {
  telegram_id: string;
  public_id: string;
  username: string;
  first_name: string;
  last_name: string;
  photo_url: string;
  phone_verified: boolean;
  phone_masked: string | null;
  city: string;
  role: Role;
  is_banned: boolean;
  ban_reason: string;
  is_verified_seller: boolean;
  language: Language;
  free_listings_left: number;
  open_listings: number;
  created_at: string;
}

export interface PublicSettings {
  listing_fee_etb: number;
  free_listings_quota: number;
  listing_duration_days: number;
  max_active_listings: number;
  boost_price_etb: number;
  boost_days: number;
  payment_sla_minutes: number;
  contact_daily_limit: number;
  telebirr_number: string;
  telebirr_name: string;
  support_username: string;
  bot_username: string;
  mini_app_short_name: string;
}

export interface PaymentDetail {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_etb: number;
  reference: string;
  has_screenshot: boolean;
  reject_reason: PaymentRejectReason | null;
  admin_note: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  product: { id: string; title: string; price: number | null; status: ListingStatus; cover_path: string | null };
  pay_to?: { telebirr_number: string; telebirr_name: string };
  sla_minutes?: number;
}

// ─── Admin ──────────────────────────────────────────────────────────

export interface AdminDashboard {
  role: Role;
  in_review: number;
  oldest_in_review_at: string | null;
  open_reports: number;
  new_listings_today: number;
  live_listings: number;
  payments_waiting?: number;
  oldest_payment_at?: string | null;
  sla_minutes?: number;
  revenue_7d?: number;
  revenue_30d?: number;
  revenue_by_day?: Array<{ day: string; amount: number }>;
  funnel_30d?: { created: number; submitted: number; paid: number; live: number };
  top_categories?: Array<{ category: Category; count: number }>;
  users_total?: number;
  users_today?: number;
  outbox_failed?: number;
}

export interface QueueItem {
  id: string;
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
  flags: ListingFlag[];
  is_free: boolean;
  waiting_since: string;
  was_live: boolean;
  median_price: number | null;
  images: string[];
  seller: {
    public_id: string;
    name: string;
    username: string;
    verified: boolean;
    member_since: string;
    phone_verified: boolean;
    rating: Rating;
    live_count: number;
    sold_count: number;
    past_rejections: number;
    open_reports: number;
  };
}

export interface AdminPayment {
  id: string;
  kind: PaymentKind;
  status: PaymentStatus;
  amount_etb: number;
  reference: string;
  has_screenshot: boolean;
  reject_reason: PaymentRejectReason | null;
  admin_note: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  duplicate_count: number;
  product: { id: string; title: string; price: number | null; status: ListingStatus; category: Category | null; cover_path: string | null };
  seller: { name: string; username: string; public_id: string; verified: boolean };
}

export interface AdminReport {
  id: string;
  target_type: 'product' | 'user';
  reason: ReportReason;
  note: string;
  status: 'open' | 'dismissed' | 'actioned';
  resolution: string;
  created_at: string;
  reporter_name: string;
  same_target_open: number;
  product: {
    id: string;
    title: string;
    price: number | null;
    status: ListingStatus;
    cover_path: string | null;
    seller_name: string;
    seller_public_id: string;
  } | null;
  user: { public_id: string; name: string; username: string; is_banned: boolean } | null;
}

export interface AdminUser {
  public_id: string;
  telegram_id: string;
  username: string;
  first_name: string;
  last_name: string;
  phone: string;
  phone_verified: boolean;
  city: string;
  role: Role;
  is_banned: boolean;
  ban_reason: string;
  is_verified_seller: boolean;
  language: Language;
  created_at: string;
  last_seen_at: string;
  live_count: number;
  listing_count: number;
  rating: Rating;
}

export interface AdminUserDetail extends AdminUser {
  listings: Array<{ id: string; title: string; price: number | null; status: ListingStatus; updated_at: string }>;
  payments: Array<{ id: string; kind: PaymentKind; status: PaymentStatus; amount_etb: number; reference: string; created_at: string }>;
  reports_against: number;
  reports_filed: number;
}

export interface AdminListing {
  id: string;
  title: string;
  price: number | null;
  status: ListingStatus;
  category: Category | null;
  city: string;
  flags: ListingFlag[];
  views: number;
  updated_at: string;
  published_at: string | null;
  expires_at: string | null;
  cover_path: string | null;
  seller: { name: string; username: string; public_id: string };
}

export interface AdminSettings {
  listing_fee_etb: number;
  free_listings_quota: number;
  listing_duration_days: number;
  reminder_days_before: number;
  max_active_listings: number;
  boost_price_etb: number;
  boost_days: number;
  contact_daily_limit: number;
  payment_sla_minutes: number;
  telebirr_number: string;
  telebirr_name: string;
  support_username: string;
  bot_username: string;
  mini_app_short_name: string;
  channel_id: string;
  channel_autopost: boolean;
  banned_words: string[];
  updated_at: string;
  updated_by: string | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  target_type: string;
  target_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
  actor: { name: string | null; username: string | null; public_id: string | null };
}

// ─── RPC contract ───────────────────────────────────────────────────

export interface SearchArgs {
  p_query?: string | null;
  p_category?: Category | null;
  p_conditions?: Condition[] | null;
  p_city?: string | null;
  p_brand?: string | null;
  p_min_price?: number | null;
  p_max_price?: number | null;
  p_specs?: Specs | null;
  p_sort?: SortOption;
  p_featured_only?: boolean;
  p_limit?: number;
  p_offset?: number;
}

type Void = Record<string, never>;

export interface RpcMap {
  // public
  search_listings: [SearchArgs, SearchResult];
  home_feed: [{ p_city?: string | null }, HomeFeed];
  get_listing: [{ p_id: string }, ListingDetail];
  get_seller: [{ p_public_id: string }, SellerProfile];
  get_public_settings: [Void, PublicSettings];
  price_hint: [{ p_category: Category; p_brand?: string | null }, { median: number | null; low: number | null; high: number | null }];
  // account
  get_me: [Void, Me];
  update_my_profile: [{ p_input: { city?: string; language?: Language } }, Me];
  // buyer
  register_view: [{ p_id: string }, null];
  toggle_favorite: [{ p_id: string }, boolean];
  my_favorites: [Void, FavoriteItem[]];
  request_contact: [{ p_id: string }, ContactResult];
  submit_report: [{ p_target_type: 'product' | 'user'; p_target_id: string; p_reason: ReportReason; p_note?: string }, string];
  submit_review: [{ p_product_id: string; p_rating: number; p_comment?: string }, string];
  // seller
  my_listings: [Void, MyListing[]];
  get_my_listing: [{ p_id: string }, DraftListing];
  create_listing: [{ p_input: ListingInput }, string];
  update_listing: [{ p_id: string; p_input: ListingInput }, { status: ListingStatus; needs_review: boolean }];
  set_listing_images: [{ p_id: string; p_images: ListingImage[] }, { count: number; status: ListingStatus }];
  submit_listing: [{ p_id: string }, SubmitResult];
  set_listing_status: [{ p_id: string; p_status: 'paused' | 'active' | 'sold' }, ListingStatus];
  renew_listing: [{ p_id: string }, SubmitResult];
  delete_listing: [{ p_id: string }, { deleted: boolean; paths: string[] }];
  create_boost_payment: [{ p_id: string }, { payment_id: string; amount_etb: number }];
  // payments
  get_payment: [{ p_id: string }, PaymentDetail];
  submit_payment_reference: [{ p_payment_id: string; p_reference: string; p_screenshot_path?: string }, PaymentDetail];
  // staff
  admin_dashboard: [Void, AdminDashboard];
  admin_review_queue: [{ p_limit?: number }, QueueItem[]];
  moderate_listing: [{ p_id: string; p_approve: boolean; p_reason?: ListingRejectReason | null; p_note?: string }, ListingStatus];
  admin_remove_listing: [{ p_id: string; p_reason: ListingRejectReason; p_note?: string }, ListingStatus];
  admin_list_listings: [{ p_status?: string; p_search?: string | null; p_limit?: number; p_offset?: number }, AdminListing[]];
  admin_list_reports: [{ p_status?: string; p_limit?: number }, AdminReport[]];
  resolve_report: [{ p_id: string; p_action: 'dismiss' | 'remove_listing' | 'ban_user'; p_note?: string }, string];
  // admin
  admin_list_payments: [{ p_status?: string; p_search?: string | null; p_limit?: number; p_offset?: number }, AdminPayment[]];
  admin_confirm_payment: [{ p_id: string; p_note?: string }, PaymentDetail];
  admin_reject_payment: [{ p_id: string; p_reason: PaymentRejectReason; p_note?: string }, PaymentDetail];
  admin_refund_payment: [{ p_id: string; p_note?: string }, PaymentDetail];
  admin_list_users: [{ p_search?: string | null; p_filter?: string; p_limit?: number; p_offset?: number }, AdminUser[]];
  admin_get_user: [{ p_public_id: string }, AdminUserDetail];
  admin_set_ban: [{ p_public_id: string; p_banned: boolean; p_reason?: string }, AdminUser];
  admin_set_role: [{ p_public_id: string; p_role: Role }, AdminUser];
  admin_set_verified: [{ p_public_id: string; p_verified: boolean }, AdminUser];
  admin_get_settings: [Void, AdminSettings];
  admin_update_settings: [{ p_input: Partial<Omit<AdminSettings, 'updated_at' | 'updated_by'>> }, AdminSettings];
  admin_audit_log: [
    { p_action?: string | null; p_target_type?: string | null; p_actor?: string | null; p_limit?: number; p_offset?: number },
    AuditEntry[],
  ];
}

export type RpcName = keyof RpcMap;
export type RpcArgs<K extends RpcName> = RpcMap[K][0];
export type RpcResult<K extends RpcName> = RpcMap[K][1];

export interface FnMap {
  'auth-telegram': [{ initData: string }, { access_token: string; expires_at: number }];
  'verify-phone': [{ response: string }, { phone_verified: true }];
  storage: [
    | { action: 'listing-image'; product_id: string; ext: string }
    | { action: 'payment-proof'; ext: string }
    | { action: 'view-proof'; payment_id: string },
    { path?: string; token?: string; signed_url?: string; url?: string },
  ];
}
export type FnName = keyof FnMap;
