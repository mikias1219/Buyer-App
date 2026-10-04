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

export const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
export const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';

export const isSupabaseConfigured =
  /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$|^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(supabaseUrl) &&
  supabaseAnonKey.length > 20;

/** Mock mode: explicit flag in dev/e2e builds, or dev without Supabase config. Never in production. */
// Written with literal import.meta.env so production builds constant-fold this to `false`
// and drop the mock chunk entirely.
export const useMockBackend =
  (import.meta.env.DEV || import.meta.env.MODE === 'e2e') &&
  (import.meta.env.VITE_USE_MOCK === 'true' || (import.meta.env.DEV && !isSupabaseConfigured));

let backendPromise: Promise<Backend | null> | null = null;

/** Resolves to null when production is not configured (the app shows a setup screen). */
export function getBackend(): Promise<Backend | null> {
  backendPromise ??= (async () => {
    if ((import.meta.env.DEV || import.meta.env.MODE === 'e2e') && useMockBackend) {
      const { createMockBackend } = await import('./mock/mockBackend');
      return createMockBackend();
    }
    if (!isSupabaseConfigured) return null;
    const { createSupabaseBackend } = await import('./supabaseBackend');
    return createSupabaseBackend();
  })();
  return backendPromise;
}
