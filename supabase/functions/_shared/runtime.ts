// Deno-side helpers shared by the Edge Functions (not imported by the web app or Node tests).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { bearerToken, verifyJwt, type AccessClaims } from './jwt.ts';

export class MissingEnvError extends Error {
  constructor(readonly variable: string) {
    super(`Missing required env var ${variable}`);
  }
}

export function env(name: string, required = true): string {
  const value = Deno.env.get(name) ?? '';
  if (required && !value) throw new MissingEnvError(name);
  return value;
}

/**
 * Deno.serve with consistent error handling: a missing secret returns
 * `{ error: 'server_misconfigured', missing: '<NAME>' }` (name only, never a value).
 */
export function serve(handler: (req: Request) => Promise<Response>): void {
  Deno.serve(async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      if (err instanceof MissingEnvError) {
        console.error(err.message);
        return new Response(JSON.stringify({ error: 'server_misconfigured', missing: err.variable }), {
          status: 500,
          headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
        });
      }
      console.error(err);
      return new Response(JSON.stringify({ error: 'server_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
      });
    }
  });
}

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin') ?? '';
  const allow = allowedOrigins.length === 0 || allowedOrigins.includes(origin) ? origin || '*' : allowedOrigins[0]!;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(req) },
  });
}

/** Stable error codes; the client maps them to localized messages. */
export function fail(req: Request, code: string, status = 400): Response {
  return json(req, { error: code }, status);
}

export function serviceClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Client acting as the caller (RLS + RPC authorization apply). */
export function userClient(token: string): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireCaller(req: Request): Promise<{ claims: AccessClaims; token: string } | null> {
  const token = bearerToken(req.headers.get('authorization'));
  if (!token) return null;
  const claims = await verifyJwt(token, env('JWT_SECRET'));
  return claims ? { claims, token } : null;
}

/** Simple in-memory per-instance throttle (defense in depth; DB rate limits are authoritative). */
const hits = new Map<string, { count: number; reset: number }>();
export function throttle(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || entry.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}

export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
