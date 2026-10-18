/**
 * Money is always shown as `ETB 25,000` / `ETB 40.50` (SPEC A7), regardless of UI language.
 * Cents appear only when present. `signed` adds +/− (profit, deltas).
 */
export function formatEtb(value: number | null | undefined, opts: { signed?: boolean; currency?: string } = {}): string {
  const currency = opts.currency ?? 'ETB';
  if (value === null || value === undefined || !Number.isFinite(value)) return `${currency} —`;
  const rounded = Math.round(value * 100) / 100;
  const abs = Math.abs(rounded);
  const hasCents = Math.round(abs * 100) % 100 !== 0;
  const body = abs.toLocaleString('en-US', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
  const sign = rounded < 0 ? '−' : opts.signed && rounded > 0 ? '+' : '';
  return `${sign}${currency} ${body}`;
}

export function formatNumber(value: number, maxFractionDigits = 3): string {
  return value.toLocaleString('en-US', { maximumFractionDigits: maxFractionDigits });
}

/** Percent change between two values; null when the base is zero. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
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
  // Plain YYYY-MM-DD dates are calendar days: format them without shifting through a time zone.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00Z`) : new Date(iso);
  return new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function formatTime(iso: string | null | undefined, lang: string, timeZone?: string): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat(lang === 'am' ? 'am-ET' : 'en-GB', { hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(
    new Date(iso),
  );
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
