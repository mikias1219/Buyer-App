/** Prices are always shown as `ETB 25,000` (SPEC A7), regardless of UI language. */
export function formatEtb(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return 'ETB —';
  return `ETB ${Math.round(value).toLocaleString('en-US')}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

/** "3 hours ago" / "በ3 ሰዓታት ውስጥ" style relative time. */
export function formatRelative(iso: string | null | undefined, lang: string, nowMs: number = Date.now()): string {
  if (!iso) return '';
  const diffSec = Math.round((Date.parse(iso) - nowMs) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang === 'am' ? 'am' : 'en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diffSec), 'second');
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day');
  if (abs < 86400 * 365) return rtf.format(Math.round(diffSec / (86400 * 30)), 'month');
  return rtf.format(Math.round(diffSec / (86400 * 365)), 'year');
}

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  );
}

/** Minutes since a timestamp (for admin SLA badges). */
export function minutesSince(iso: string | null | undefined, nowMs: number = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));
}

/** Parse "25,000" / "25 000" into 25000; null when empty or invalid. */
export function parseAmount(input: string): number | null {
  const digits = input.replace(/[^\d.]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

export function groupThousands(input: string): string {
  const n = parseAmount(input);
  return n === null ? '' : Math.round(n).toLocaleString('en-US');
}
