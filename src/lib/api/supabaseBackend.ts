import { supabaseAnonKey, supabaseUrl, type Backend } from './backend';
import { AppError, toAppError } from './errors';
import { tokenStore } from './token';
import type { FnMap, FnName, RpcArgs, RpcName, RpcResult } from './types';

/**
 * Production transport. The client only needs three Supabase endpoints (PostgREST RPC, Edge
 * Functions, Storage signed uploads), so it talks to them with fetch instead of bundling
 * supabase-js (~55 KB gzip). The JWT comes from the in-memory token store; guests use the anon key.
 */
export function createSupabaseBackend(): Backend {
  const headers = (token: string | null): Record<string, string> => ({
    apikey: supabaseAnonKey,
    Authorization: `Bearer ${token ?? supabaseAnonKey}`,
  });

  async function request(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (err) {
      throw new AppError('network', String(err));
    }
  }

  async function rpcOnce<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>> {
    const res = await request(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { ...headers(tokenStore.get()), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(args),
    });
    const text = await res.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = toAppError(body ?? { message: res.statusText });
      throw new AppError(e.code, e.detail, res.status);
    }
    return body as RpcResult<K>;
  }

  return {
    kind: 'supabase',

    async rpc(name, args) {
      try {
        return await rpcOnce(name, args);
      } catch (err) {
        const e = toAppError(err);
        // Expired JWT: re-authenticate once with Telegram initData and retry.
        if (e.code === 'session_expired' || (e.status === 401 && tokenStore.get() === null)) {
          const fresh = await tokenStore.refresh();
          if (fresh) return rpcOnce(name, args);
        }
        throw e;
      }
    },

    async fn<K extends FnName>(name: K, body: FnMap[K][0], opts: { auth?: boolean } = {}) {
      const token = opts.auth === false ? null : tokenStore.get();
      const res = await request(`${supabaseUrl}/functions/v1/${name}`, {
        method: 'POST',
        headers: { ...headers(token), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string } & FnMap[K][1];
      if (!res.ok) throw new AppError(payload.error ?? 'generic', '', res.status);
      return payload;
    },

    async uploadToSignedUrl(bucket, path, token, file) {
      const url = `${supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(token)}`;
      const res = await request(url, {
        method: 'PUT',
        headers: { apikey: supabaseAnonKey, 'Content-Type': file.type || 'image/webp', 'x-upsert': 'false' },
        body: file,
      });
      if (!res.ok) throw new AppError('upload_failed', await res.text().catch(() => ''), res.status);
    },

    imageUrl(path, opts) {
      const base = `${supabaseUrl}/storage/v1`;
      // Image transformations (Supabase Pro) resize on the fly; plain object URL otherwise.
      if (opts?.width && import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMS === 'true') {
        return `${base}/render/image/public/listing-images/${path}?width=${opts.width}&quality=75&resize=contain`;
      }
      return `${base}/object/public/listing-images/${path}`;
    },
  };
}
