/**
 * Telegram Mini App data validation (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 *
 *   secret_key = HMAC_SHA256(key = "WebAppData", message = bot_token)
 *   hash       = hex(HMAC_SHA256(key = secret_key, message = data_check_string))
 *
 * data_check_string = every received field except `hash`, as `key=value`, sorted by key, joined by "\n".
 * The same scheme signs the payload returned by `WebApp.requestContact`.
 * Pure WebCrypto: runs in Deno (Edge Functions) and Node ≥ 20 (tests).
 */

export interface TelegramInitUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export interface VerifiedFields {
  fields: Record<string, string>;
  authDate: number;
}

export type VerifyResult =
  | { ok: true; data: VerifiedFields }
  | { ok: false; reason: 'missing_hash' | 'bad_signature' | 'missing_auth_date' | 'expired' | 'future_auth_date' };

const encoder = new TextEncoder();

async function hmac(key: ArrayBuffer | Uint8Array<ArrayBuffer>, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
}

export function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time comparison for equal-length hex strings. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function dataCheckString(params: URLSearchParams): string {
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== 'hash') pairs.push(`${key}=${value}`);
  });
  return pairs.sort().join('\n');
}

export async function signTelegramData(params: URLSearchParams, botToken: string): Promise<string> {
  const secret = await hmac(encoder.encode('WebAppData'), botToken);
  return toHex(await hmac(secret, dataCheckString(params)));
}

export interface VerifyOptions {
  /** Maximum accepted age of `auth_date`, in seconds. */
  maxAgeSeconds: number;
  /** Current time in seconds (injectable for tests). */
  nowSeconds?: number;
}

export async function verifyTelegramData(raw: string, botToken: string, opts: VerifyOptions): Promise<VerifyResult> {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash || !/^[0-9a-f]{64}$/.test(hash)) return { ok: false, reason: 'missing_hash' };

  const expected = await signTelegramData(params, botToken);
  if (!timingSafeEqual(expected, hash)) return { ok: false, reason: 'bad_signature' };

  const authDate = Number(params.get('auth_date'));
  if (!Number.isInteger(authDate) || authDate <= 0) return { ok: false, reason: 'missing_auth_date' };
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (authDate > now + 60) return { ok: false, reason: 'future_auth_date' };
  if (now - authDate > opts.maxAgeSeconds) return { ok: false, reason: 'expired' };

  const fields: Record<string, string> = {};
  params.forEach((value, key) => {
    if (key !== 'hash') fields[key] = value;
  });
  return { ok: true, data: { fields, authDate } };
}

export function parseInitUser(fields: Record<string, string>): TelegramInitUser | null {
  try {
    const user = JSON.parse(fields.user ?? 'null') as TelegramInitUser | null;
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0) return null;
    return user;
  } catch {
    return null;
  }
}

export interface SharedContact {
  user_id: number;
  phone_number: string;
}

export function parseSharedContact(fields: Record<string, string>): SharedContact | null {
  try {
    const contact = JSON.parse(fields.contact ?? 'null') as Partial<SharedContact> | null;
    if (!contact || !Number.isSafeInteger(contact.user_id) || typeof contact.phone_number !== 'string') return null;
    return { user_id: contact.user_id as number, phone_number: contact.phone_number };
  } catch {
    return null;
  }
}
