/**
 * Minimal HS256 JWT sign/verify (WebCrypto) for Supabase-compatible access tokens.
 * Claims follow Supabase conventions so PostgREST accepts them: `role: 'authenticated'`, `aud`, `exp`.
 * `tg_id` is read by public.current_tg_id() in the database.
 */

export interface AccessClaims {
  sub: string;
  tg_id: string;
  role: 'authenticated';
  aud: 'authenticated';
  iat: number;
  exp: number;
  iss?: string;
}

const encoder = new TextEncoder();

function base64url(input: Uint8Array | string): string {
  const bytes = typeof input === 'string' ? encoder.encode(input) : input;
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((input.length + 3) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

type HmacKey = Awaited<ReturnType<typeof crypto.subtle.importKey>>;

async function hmacKey(secret: string): Promise<HmacKey> {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

export async function signJwt(claims: AccessClaims, secret: string): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify(claims));
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64url(new Uint8Array(signature))}`;
}

export async function verifyJwt(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<AccessClaims | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  try {
    const head = JSON.parse(new TextDecoder().decode(base64urlDecode(header))) as { alg?: string };
    if (head.alg !== 'HS256') return null;
    const sig = base64urlDecode(signature);
    const ok = await crypto.subtle.verify(
      'HMAC',
      await hmacKey(secret),
      sig as Uint8Array<ArrayBuffer>,
      encoder.encode(`${header}.${payload}`),
    );
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(base64urlDecode(payload))) as AccessClaims;
    if (typeof claims.exp !== 'number' || claims.exp <= nowSeconds) return null;
    if (typeof claims.tg_id !== 'string' || !/^[0-9]{1,20}$/.test(claims.tg_id)) return null;
    if (claims.role !== 'authenticated') return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}
