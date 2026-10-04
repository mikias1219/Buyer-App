import type { Category, Condition } from '../types';
import type { MockDb, MockProduct, MockUser } from './mockBackend';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const ahead = (days: number) => new Date(Date.now() + days * DAY).toISOString();

const PALETTE: Record<Category, [string, string]> = {
  phone: ['#0F766E', '#14B8A6'],
  laptop: ['#1E3A8A', '#3B82F6'],
  tablet: ['#6D28D9', '#A78BFA'],
  desktop: ['#334155', '#64748B'],
  watch: ['#9A3412', '#FB923C'],
  audio: ['#831843', '#F472B6'],
  accessory: ['#365314', '#84CC16'],
  other: ['#3F3F46', '#A1A1AA'],
};

const SHAPES: Record<Category, string> = {
  phone: '<rect x="150" y="60" width="100" height="180" rx="16" fill="#fff" opacity=".92"/><rect x="160" y="76" width="80" height="140" rx="6" fill="currentColor" opacity=".35"/>',
  laptop: '<rect x="110" y="80" width="180" height="115" rx="8" fill="#fff" opacity=".92"/><rect x="122" y="92" width="156" height="91" rx="4" fill="currentColor" opacity=".35"/><path d="M90 205h220l-12 16H102z" fill="#fff" opacity=".92"/>',
  tablet: '<rect x="125" y="65" width="150" height="170" rx="14" fill="#fff" opacity=".92"/><rect x="137" y="78" width="126" height="144" rx="6" fill="currentColor" opacity=".35"/>',
  desktop: '<rect x="105" y="70" width="190" height="125" rx="8" fill="#fff" opacity=".92"/><rect x="185" y="195" width="30" height="22" fill="#fff" opacity=".92"/><rect x="160" y="215" width="80" height="10" rx="4" fill="#fff" opacity=".92"/>',
  watch: '<rect x="170" y="50" width="60" height="40" rx="8" fill="#fff" opacity=".8"/><rect x="160" y="90" width="80" height="100" rx="22" fill="#fff" opacity=".95"/><rect x="170" y="190" width="60" height="45" rx="8" fill="#fff" opacity=".8"/>',
  audio: '<path d="M130 160a70 70 0 0 1 140 0" stroke="#fff" stroke-width="14" fill="none" opacity=".92"/><rect x="115" y="150" width="40" height="70" rx="14" fill="#fff" opacity=".92"/><rect x="245" y="150" width="40" height="70" rx="14" fill="#fff" opacity=".92"/>',
  accessory: '<rect x="150" y="90" width="100" height="70" rx="12" fill="#fff" opacity=".92"/><path d="M200 160v50q0 20 25 20h30" stroke="#fff" stroke-width="10" fill="none" opacity=".92"/>',
  other: '<rect x="130" y="90" width="140" height="120" rx="18" fill="#fff" opacity=".92"/>',
};

/** Deterministic placeholder photo for `mock/<category>-<n>` paths. */
export function mockImageDataUrl(path: string): string {
  const match = /mock\/([a-z]+)-(\d+)/.exec(path);
  const category = (match?.[1] ?? 'other') as Category;
  const [a, b] = PALETTE[category] ?? PALETTE.other;
  const n = Number(match?.[2] ?? 0);
  const angle = (n * 37) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" color="${a}"><defs><linearGradient id="g" gradientTransform="rotate(${angle} .5 .5)"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/>${SHAPES[category] ?? SHAPES.other}</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function user(
  telegram_id: string,
  first_name: string,
  username: string,
  extra: Partial<MockUser> = {},
): MockUser {
  return {
    telegram_id,
    public_id: `00000000-0000-4000-8000-${telegram_id.padStart(12, '0')}`,
    username,
    first_name,
    phone: '',
    phone_verified: false,
    city: 'Addis Ababa',
    role: 'user',
    is_banned: false,
    ban_reason: '',
    is_verified_seller: false,
    language: 'en',
    listings_free_used: 0,
    created_at: ago(120),
    ...extra,
  };
}

let seq = 0;
function listing(
  seller_id: string,
  title: string,
  price: number,
  category: Category,
  brand: string,
  condition: Condition,
  city: string,
  extra: Partial<MockProduct> = {},
): MockProduct {
  seq += 1;
  const id = `11111111-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const published = ago(seq % 9);
  return {
    id,
    seller_id,
    title,
    description:
      'Well kept and fully working. Original box and charger included. Battery health is good. ' +
      'Meet in a public place in the city; test before you pay.',
    price,
    category,
    brand,
    model: '',
    condition,
    city,
    specs: {},
    negotiable: seq % 3 === 0,
    exchange: seq % 4 === 0,
    status: 'active',
    is_free: true,
    period_paid: true,
    reject_reason: null,
    reject_note: '',
    flags: [],
    renew_count: 0,
    views: (seq * 17) % 120,
    expires_at: ahead(30 - (seq % 9)),
    boosted_until: null,
    published_at: published,
    status_changed_at: published,
    created_at: published,
    updated_at: published,
    images: [1, 2, 3].map((k) => ({ path: `mock/${category}-${seq * 3 + k}`, hash: '' })),
    ...extra,
  };
}

export function seedDatabase(): MockDb {
  seq = 0;
  const users: MockUser[] = [
    user('1001', 'Abel', 'abel_buyer'),
    user('1002', 'Meron', 'meron_tech', {
      phone: '+251911000002',
      phone_verified: true,
      is_verified_seller: true,
      listings_free_used: 2,
      created_at: ago(400),
    }),
    user('1003', 'Kidus', '', { phone: '+251911000003', phone_verified: true, city: 'Adama', listings_free_used: 2 }),
    user('9001', 'Dawit', 'dawit_admin', { role: 'admin', phone: '+251911000901', phone_verified: true }),
    user('9002', 'Eden', 'eden_mod', { role: 'moderator', phone: '+251911000902', phone_verified: true }),
  ];

  const products: MockProduct[] = [
    listing('1002', 'iPhone 13 128GB Midnight', 52000, 'phone', 'Apple', 'like_new', 'Addis Ababa', {
      specs: { storage: '128GB', battery_health: 89, imei_checked: true },
      boosted_until: ahead(5),
    }),
    listing('1002', 'Samsung Galaxy S22 Ultra 256GB', 61000, 'phone', 'Samsung', 'good', 'Addis Ababa', {
      specs: { storage: '256GB', ram: '12GB' },
    }),
    listing('1003', 'Tecno Camon 20 Pro', 17500, 'phone', 'Tecno', 'good', 'Adama'),
    listing('1002', 'MacBook Air M1 8/256', 68000, 'laptop', 'Apple', 'like_new', 'Addis Ababa', {
      specs: { cpu: 'Apple M1', ram: '8GB', storage: '256GB', screen: '13.3"' },
      boosted_until: ahead(3),
    }),
    listing('1003', 'Lenovo ThinkPad T480 i5', 24000, 'laptop', 'Lenovo', 'fair', 'Adama', {
      specs: { cpu: 'Intel i5-8350U', ram: '16GB', storage: '512GB' },
    }),
    listing('1002', 'HP EliteBook 840 G6', 31000, 'laptop', 'HP', 'good', 'Hawassa'),
    listing('1003', 'iPad 9th gen 64GB Wi-Fi', 27000, 'tablet', 'Apple', 'good', 'Addis Ababa'),
    listing('1002', 'Samsung Galaxy Tab A8', 15500, 'tablet', 'Samsung', 'new', 'Bahir Dar'),
    listing('1002', 'Dell OptiPlex 7070 + 24" monitor', 29000, 'desktop', 'Dell', 'good', 'Addis Ababa'),
    listing('1003', 'Apple Watch Series 7 45mm', 21000, 'watch', 'Apple', 'like_new', 'Dire Dawa'),
    listing('1002', 'Sony WH-1000XM4', 14000, 'audio', 'Sony', 'like_new', 'Addis Ababa'),
    listing('1003', 'JBL Flip 5 speaker', 6500, 'audio', 'JBL', 'good', 'Adama'),
    listing('1002', 'Anker 65W USB-C charger', 2800, 'accessory', 'Anker', 'new', 'Addis Ababa'),
    listing('1003', 'PlayStation 4 Slim 1TB', 23000, 'other', 'Sony', 'good', 'Hawassa'),
    listing('1003', 'Redmi Note 12 128GB', 13500, 'phone', 'Xiaomi', 'good', 'Mekelle', {
      status: 'in_review',
      is_free: false,
      period_paid: true,
      published_at: null,
      expires_at: null,
      flags: ['price_low'],
      status_changed_at: ago(0.1),
    }),
    listing('1002', 'Pixel 7 128GB', 30000, 'phone', 'Google', 'good', 'Addis Ababa', {
      status: 'payment_submitted',
      is_free: false,
      period_paid: false,
      published_at: null,
      expires_at: null,
      status_changed_at: ago(0.08),
    }),
    listing('1002', 'Nokia 105', 1500, 'phone', 'Nokia', 'fair', 'Addis Ababa', {
      status: 'sold',
      expires_at: ahead(10),
    }),
  ];

  const pending = products.find((p) => p.status === 'payment_submitted');
  const sold = products.find((p) => p.status === 'sold');
  const reported = products[2];

  return {
    settings: {
      listing_fee_etb: 100,
      free_listings_quota: 2,
      listing_duration_days: 30,
      reminder_days_before: 5,
      max_active_listings: 10,
      boost_price_etb: 50,
      boost_days: 7,
      contact_daily_limit: 20,
      payment_sla_minutes: 60,
      telebirr_number: '0900000000',
      telebirr_name: 'TechMarket ET (demo)',
      support_username: 'techmarket_support',
      bot_username: 'TechMarketEtBot',
      mini_app_short_name: 'market',
      channel_id: '',
      channel_autopost: false,
      banned_words: ['replica'],
      updated_at: ago(3),
      updated_by: '9001',
    },
    users,
    products,
    payments: pending
      ? [
          {
            id: '22222222-0000-4000-8000-000000000001',
            telegram_id: pending.seller_id,
            product_id: pending.id,
            kind: 'listing',
            amount_etb: 100,
            reference: 'CKK12ABC34',
            screenshot_path: '',
            status: 'submitted',
            reject_reason: null,
            admin_note: '',
            submitted_at: ago(0.08),
            reviewed_at: null,
            refunded_at: null,
            created_at: ago(0.1),
          },
          {
            id: '22222222-0000-4000-8000-000000000002',
            telegram_id: '1002',
            product_id: products[0]?.id ?? '',
            kind: 'boost',
            amount_etb: 50,
            reference: 'BST0000001',
            screenshot_path: '',
            status: 'confirmed',
            reject_reason: null,
            admin_note: '',
            submitted_at: ago(2),
            reviewed_at: ago(2),
            refunded_at: null,
            created_at: ago(2),
          },
        ]
      : [],
    favorites: [],
    leads: sold ? [{ product_id: sold.id, buyer_id: '1001', seller_id: sold.seller_id, created_at: ago(4) }] : [],
    reports: reported
      ? [
          {
            id: '33333333-0000-4000-8000-000000000001',
            reporter_id: '1001',
            target_type: 'product',
            target_id: reported.id,
            reason: 'wrong_info',
            note: 'Photos look like a different model.',
            status: 'open',
            resolution: '',
            created_at: ago(0.5),
          },
        ]
      : [],
    reviews: [
      { seller_id: '1002', reviewer_id: '1003', product_id: products[1]?.id ?? '', rating: 5, comment: 'Exactly as described, quick meetup.', created_at: ago(20) },
      { seller_id: '1002', reviewer_id: '9002', product_id: products[3]?.id ?? '', rating: 4, comment: 'Good condition.', created_at: ago(40) },
    ],
    audit: [],
  };
}
