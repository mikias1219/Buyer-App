/**
 * In-memory holder for the app JWT (never persisted: spec Phase 2 §1).
 * The auth feature registers a refresher so the transport can recover from an expired token once.
 */
type Refresher = () => Promise<string | null>;

let token: string | null = null;
let expiresAt = 0;
let refresher: Refresher | null = null;
let inflight: Promise<string | null> | null = null;

export const tokenStore = {
  get(): string | null {
    return token && Date.now() / 1000 < expiresAt - 30 ? token : null;
  },
  set(next: string | null, exp = 0): void {
    token = next;
    expiresAt = exp;
  },
  expiresAt(): number {
    return expiresAt;
  },
  setRefresher(fn: Refresher | null): void {
    refresher = fn;
  },
  /** Re-authenticate once; concurrent callers share the same attempt. */
  refresh(): Promise<string | null> {
    if (!refresher) return Promise.resolve(null);
    inflight ??= refresher().finally(() => {
      inflight = null;
    });
    return inflight;
  },
};
