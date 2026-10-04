import { getBackend, type Backend } from './backend';
import { AppError } from './errors';
import type { FnMap, FnName, RpcArgs, RpcName, RpcResult } from './types';

let resolved: Backend | null = null;

export async function requireBackend(): Promise<Backend> {
  resolved ??= await getBackend();
  if (!resolved) throw new AppError('not_configured');
  return resolved;
}

export async function rpc<K extends RpcName>(name: K, args: RpcArgs<K>): Promise<RpcResult<K>> {
  return (await requireBackend()).rpc(name, args);
}

export async function callFunction<K extends FnName>(name: K, body: FnMap[K][0], opts?: { auth?: boolean }) {
  return (await requireBackend()).fn(name, body, opts);
}

/** Public URL of a listing image (sync; the backend is resolved during boot). */
export function imageUrl(path: string | null | undefined, width?: number): string | null {
  if (!path || !resolved) return null;
  return resolved.imageUrl(path, width ? { width } : undefined);
}

export function backendKind(): Backend['kind'] | null {
  return resolved?.kind ?? null;
}
