/** Optional Sentry (only when VITE_SENTRY_DSN is set); loaded lazily so it costs nothing otherwise. */
type SentryLike = { captureException: (e: unknown, ctx?: unknown) => void };
let sentry: SentryLike | null = null;

export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
    // No PII: we never send usernames/phones; Telegram ids are not attached.
    sendDefaultPii: false,
  });
  sentry = Sentry;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (sentry) sentry.captureException(error, context ? { extra: context } : undefined);
  else if (import.meta.env.DEV) console.error(error);
}
