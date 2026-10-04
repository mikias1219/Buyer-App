import { createClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl, type Backend } from './backend';
import { AppError, toAppError } from './errors';
import { tokenStore } from './token';
import type { FnMap, FnName, RpcArgs, RpcName, RpcResult } from './types';

export function createSupabaseBackend(): Backend {
  const client = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => tokenStore.get(),
  });

  async function rpcOnce<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>> {
    const { data, error } = await client.rpc(name, args as Record<string, unknown>);
    if (error) throw toAppError(error);
    return data as RpcResult<K>;
  }

  return {
    kind: 'supabase',

    async rpc(name, args) {
      try {
        return await rpcOnce(name, args);
      } catch (err) {
        const e = toAppError(err);
        // Expired JWT (or profile created after the token): re-authenticate once and retry.
        if (e.code === 'session_expired' || (e.code === 'not_authenticated' && tokenStore.get())) {
          const fresh = await tokenStore.refresh();
          if (fresh) return rpcOnce(name, args);
        }
        throw e;
      }
    },

    async fn<K extends FnName>(name: K, body: FnMap[K][0], opts: { auth?: boolean } = {}) {
      const token = opts.auth === false ? null : tokenStore.get();
      let res: Response;
      try {
        res = await fetch(`${supabaseUrl}/functions/v1/${name}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${token ?? supabaseAnonKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        throw new AppError('network', String(err));
      }
      const payload = (await res.json().catch(() => ({}))) as { error?: string } & FnMap[K][1];
      if (!res.ok) throw new AppError(payload.error ?? 'generic', '', res.status);
      return payload;
    },

    async uploadToSignedUrl(bucket, path, token, file) {
      const { error } = await client.storage.from(bucket).uploadToSignedUrl(path, token, file, {
        contentType: file.type || 'image/webp',
      });
      if (error) throw new AppError('upload_failed', error.message);
    },

    imageUrl(path, opts) {
      const base = `${supabaseUrl}/storage/v1`;
      // Image transformations (Pro plan) resize on the fly; plain object URL otherwise.
      if (opts?.width && import.meta.env.VITE_SUPABASE_IMAGE_TRANSFORMS === 'true') {
        return `${base}/render/image/public/listing-images/${path}?width=${opts.width}&quality=75&resize=contain`;
      }
      return `${base}/object/public/listing-images/${path}`;
    },
  };
}
