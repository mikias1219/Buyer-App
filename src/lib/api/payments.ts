import { supabase, isSupabaseConfigured } from '../supabaseClient';
import type { Payment, PaymentStatus } from '../../types/payment';

const LOCAL_KEY = 'tm_payments';

function readLocal(): Payment[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]') as Payment[];
  } catch {
    return [];
  }
}

function writeLocal(items: Payment[]) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(items));
}

export async function createPayment(input: {
  telegram_id: string;
  product_id: string;
  amount_etb: number;
}): Promise<Payment | null> {
  const now = new Date().toISOString();
  const row: Payment = {
    id: crypto.randomUUID(),
    telegram_id: input.telegram_id,
    product_id: input.product_id,
    amount_etb: input.amount_etb,
    method: 'telebirr',
    reference: '',
    status: 'pending',
    admin_note: '',
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured || !supabase) {
    const all = readLocal();
    all.unshift(row);
    writeLocal(all);
    return row;
  }

  const { data, error } = await supabase
    .from('payments')
    .insert({
      telegram_id: input.telegram_id,
      product_id: input.product_id,
      amount_etb: input.amount_etb,
      method: 'telebirr',
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('[payments] create failed:', error.message);
    return null;
  }

  return {
    ...data,
    amount_etb: Number(data.amount_etb),
  } as Payment;
}

export async function submitPaymentReference(
  paymentId: string,
  reference: string,
): Promise<Payment | null> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) {
    const all = readLocal();
    const idx = all.findIndex((p) => p.id === paymentId);
    const current = all[idx];
    if (!current) return null;
    const next: Payment = { ...current, reference, status: 'submitted', updated_at: now };
    all[idx] = next;
    writeLocal(all);
    return next;
  }

  const { data, error } = await supabase
    .from('payments')
    .update({ reference, status: 'submitted', updated_at: now })
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    console.error('[payments] submit failed:', error.message);
    return null;
  }

  return { ...data, amount_etb: Number(data.amount_etb) } as Payment;
}

export async function updatePaymentStatus(
  paymentId: string,
  status: PaymentStatus,
  adminNote = '',
): Promise<Payment | null> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) {
    const all = readLocal();
    const idx = all.findIndex((p) => p.id === paymentId);
    const current = all[idx];
    if (!current) return null;
    const next: Payment = { ...current, status, admin_note: adminNote, updated_at: now };
    all[idx] = next;
    writeLocal(all);
    return next;
  }

  const { data, error } = await supabase
    .from('payments')
    .update({ status, admin_note: adminNote, updated_at: now })
    .eq('id', paymentId)
    .select()
    .single();

  if (error) {
    console.error('[payments] status failed:', error.message);
    return null;
  }

  return { ...data, amount_etb: Number(data.amount_etb) } as Payment;
}

export async function fetchPayments(): Promise<Payment[]> {
  if (!isSupabaseConfigured || !supabase) {
    return readLocal();
  }

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[payments] list failed:', error.message);
    return [];
  }

  return ((data as Payment[]) ?? []).map((p) => ({
    ...p,
    amount_etb: Number(p.amount_etb),
  }));
}

export async function fetchPaymentById(id: string): Promise<Payment | null> {
  if (!isSupabaseConfigured || !supabase) {
    return readLocal().find((p) => p.id === id) ?? null;
  }

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) return null;
  return { ...data, amount_etb: Number(data.amount_etb) } as Payment;
}
