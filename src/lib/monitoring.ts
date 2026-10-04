/** Optional Sentry (only when VITE_SENTRY_DSN is set); loaded lazily so it costs nothing otherwise. */
type Capture = (error: unknown, extra?: Record<string, unknown>) => void;
let capture: Capture | null = null;

export async function initMonitoring(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;
  const Sentry = await import('@sentry/react');
  // No PII is sent: Sentry's default is not to attach IPs/cookies, and we never attach user data.
  Sentry.init({ dsn, environment: import.meta.env.MODE, tracesSampleRate: 0 });
  capture = (error, extra) => {
    Sentry.captureException(error, extra ? { extra } : undefined);
  };
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  if (capture) capture(error, context);
  else if (import.meta.env.DEV) console.error(error);
}
