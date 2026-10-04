import type { FnMap, FnName, RpcArgs, RpcName, RpcResult } from './types';

/**
 * Transport used by every feature. Two implementations:
 *  - supabaseBackend: production (RPCs over PostgREST, Edge Functions, Storage)
 *  - mockBackend: in-memory, dev-only or e2e builds; never loaded in a normal production build.
 */
export interface Backend {
  readonly kind: 'supabase' | 'mock';
  rpc<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>>;
  fn<K extends FnName>(name: K, body: FnMap[K][0], opts?: { auth?: boolean }): Promise<FnMap[K][1]>;
  uploadToSignedUrl(bucket: 'listing-images' | 'payment-proofs', path: string, token: string, file: Blob): Promise<void>;
  imageUrl(path: string, opts?: { width?: number }): string;
}

const env = import.meta.env;

export const supabaseUrl = (env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const supabaseAnonKey = (env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(supabaseUrl) &&
  supabaseAnonKey.length > 20;

/** Mock mode: explicit flag in dev/e2e builds, or dev without Supabase config. Never in production. */
export const useMockBackend =
  (env.DEV || env.MODE === 'e2e') && (env.VITE_USE_MOCK === 'true' || (env.DEV && !isSupabaseConfigured));

let backendPromise: Promise<Backend | null> | null = null;

/** Resolves to null when production is not configured (the app shows a setup screen). */
export function getBackend(): Promise<Backend | null> {
  backendPromise ??= (async () => {
    if (useMockBackend) {
      const { createMockBackend } = await import('./mock/mockBackend');
      return createMockBackend();
    }
    if (!isSupabaseConfigured) return null;
    const { createSupabaseBackend } = await import('./supabaseBackend');
    return createSupabaseBackend();
  })();
  return backendPromise;
}
