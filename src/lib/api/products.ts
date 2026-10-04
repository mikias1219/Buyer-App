import { supabase, isSupabaseConfigured } from '../supabaseClient';
import type { NewProductInput, Product, ProductStatus } from '../../types/product';
import { MOCK_PRODUCTS } from '../mockData';

const LOCAL_KEY = 'tm_products_extra';

function readExtra(): Product[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as Product[];
  } catch {
    return [];
  }
}

function writeExtra(items: Product[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

function normalize(row: Product): Product {
  return {
    ...row,
    price: Number(row.price),
    listing_fee_etb: Number(row.listing_fee_etb ?? 0),
    status: (row.status as ProductStatus) || 'active',
    brand: row.brand ?? '',
    city: row.city ?? '',
    payment_id: row.payment_id ?? null,
  };
}

export async function fetchProducts(options?: {
  activeOnly?: boolean;
}): Promise<{ products: Product[]; fromMock: boolean }> {
  if (!isSupabaseConfigured || !supabase) {
    const merged = [...readExtra(), ...MOCK_PRODUCTS].map(normalize);
    const products = options?.activeOnly
      ? merged.filter((p) => p.status === 'active')
      : merged;
    return { products, fromMock: true };
  }

  let query = supabase.from('products').select('*').order('created_at', { ascending: false });
  if (options?.activeOnly) {
    query = query.eq('status', 'active');
  }

  const { data, error } = await query;
  if (error) {
    console.error('[products] fetch failed:', error.message);
    return { products: MOCK_PRODUCTS.map(normalize), fromMock: true };
  }

  const products = ((data as Product[]) ?? []).map(normalize);
  if (products.length === 0 && options?.activeOnly) {
    return { products: MOCK_PRODUCTS.map(normalize), fromMock: true };
  }

  return { products, fromMock: false };
}

export async function insertProduct(input: {
  product: NewProductInput;
  seller_id: string;
  seller_username: string;
  listing_fee_etb: number;
  status?: ProductStatus;
}): Promise<Product | null> {
  const now = new Date().toISOString();
  const row: Product = {
    id: crypto.randomUUID(),
    ...input.product,
    brand: input.product.brand ?? '',
    city: input.product.city ?? '',
    seller_id: input.seller_id,
    seller_username: input.seller_username,
    created_at: now,
    status: input.status ?? 'pending_payment',
    listing_fee_etb: input.listing_fee_etb,
    payment_id: null,
  };

  if (!isSupabaseConfigured || !supabase) {
    const all = readExtra();
    all.unshift(row);
    writeExtra(all);
    return row;
  }

  const { data, error } = await supabase
    .from('products')
    .insert({
      title: row.title,
      description: row.description,
      price: row.price,
      category: row.category,
      condition: row.condition,
      image_url: row.image_url,
      seller_id: row.seller_id,
      seller_username: row.seller_username,
      status: row.status,
      brand: row.brand,
      city: row.city,
      listing_fee_etb: row.listing_fee_etb,
    })
    .select()
    .single();

  if (error) {
    console.error('[products] insert failed:', error.message);
    return null;
  }

  return normalize(data as Product);
}

export async function updateProduct(
  id: string,
  patch: Partial<
    Pick<Product, 'status' | 'payment_id' | 'title' | 'price' | 'description'>
  >,
): Promise<Product | null> {
  if (!isSupabaseConfigured || !supabase) {
    const extras = readExtra();
    const idx = extras.findIndex((p) => p.id === id);
    const current = extras[idx];
    if (current) {
      const next: Product = { ...current, ...patch };
      extras[idx] = next;
      writeExtra(extras);
      return next;
    }
    // Allow updating mock catalog in-memory via extras copy
    const mock = MOCK_PRODUCTS.find((p) => p.id === id);
    if (!mock) return null;
    const updated = { ...normalize(mock), ...patch };
    extras.unshift(updated);
    writeExtra(extras.filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i));
    return updated;
  }

  const { data, error } = await supabase
    .from('products')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('[products] update failed:', error.message);
    return null;
  }

  return normalize(data as Product);
}

export async function fetchAllProductsAdmin(): Promise<Product[]> {
  const { products } = await fetchProducts({ activeOnly: false });
  return products;
}
