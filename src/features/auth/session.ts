import { useSyncExternalStore } from 'react';
import { requireBackend } from '../../lib/api/client';
import { AppError, toAppError } from '../../lib/api/errors';
import { tokenStore } from '../../lib/api/token';
import { getInitData } from '../../lib/telegram';

/**
 * Session lifecycle:
 *  booting → authenticated (Telegram) | guest (opened outside Telegram: browse only)
 *          | expired (initData older than 24h: reopen from the bot) | error (retryable) | unconfigured
 * The JWT lives only in memory (tokenStore) and is refreshed 5 minutes before expiry.
 */
export type SessionStatus = 'booting' | 'authenticated' | 'guest' | 'expired' | 'error' | 'unconfigured';

export interface SessionState {
  status: SessionStatus;
  mock: boolean;
  error: AppError | null;
}

let state: SessionState = { status: 'booting', mock: false, error: null };
const listeners = new Set<() => void>();
let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: Partial<SessionState>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function getSession(): SessionState {
  return state;
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

async function authenticate(): Promise<string | null> {
  const backend = await requireBackend();
  const initData = backend.kind === 'mock' ? 'mock' : getInitData();
  if (!initData) {
    setState({ status: 'guest', error: null });
    return null;
  }
  try {
    const { access_token, expires_at } = await backend.fn('auth-telegram', { initData }, { auth: false });
    tokenStore.set(access_token, expires_at);
    scheduleRefresh(expires_at);
    setState({ status: 'authenticated', error: null });
    return access_token;
  } catch (err) {
    const e = toAppError(err);
    tokenStore.set(null);
    setState({ status: e.code === 'init_data_expired' ? 'expired' : 'error', error: e });
    return null;
  }
}

function scheduleRefresh(expiresAt: number): void {
  if (refreshTimer) clearTimeout(refreshTimer);
  const ms = Math.max(expiresAt * 1000 - Date.now() - 5 * 60_000, 30_000);
  refreshTimer = setTimeout(() => void authenticate(), ms);
}

tokenStore.setRefresher(authenticate);

let started: Promise<void> | null = null;

/** Idempotent boot. */
export function startSession(): Promise<void> {
  started ??= (async () => {
    try {
      const backend = await requireBackend();
      setState({ mock: backend.kind === 'mock' });
      await authenticate();
    } catch (err) {
      const e = toAppError(err);
      setState({ status: e.code === 'not_configured' ? 'unconfigured' : 'error', error: e });
    }
  })();
  return started;
}

export async function retrySession(): Promise<void> {
  started = null;
  setState({ status: 'booting', error: null });
  await startSession();
}
