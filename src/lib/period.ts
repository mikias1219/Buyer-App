/**
 * Report periods (SPEC A3.16, A6 Dashboard). Dates are local calendar dates (YYYY-MM-DD) in the
 * shop's time zone; the database interprets them the same way. Weeks start on Monday.
 */

export const PERIOD_PRESETS = ['today', 'yesterday', 'this_week', 'last_7', 'this_month', 'last_month', 'last_30', 'this_year'] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];
/** The short list shown on everyday screens (dashboard, sales). */
export const SIMPLE_PERIODS = ['today', 'yesterday', 'this_week', 'this_month'] as const satisfies readonly PeriodPreset[];

export interface DateRange {
  from: string;
  to: string;
}

export type Period = { preset: PeriodPreset } | { preset: 'custom'; from: string; to: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Today's date in `timeZone` (falls back to UTC for unknown zones). */
export function localToday(timeZone: string, now: Date = new Date()): string {
  try {
    // en-CA formats as YYYY-MM-DD.
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Calendar arithmetic on YYYY-MM-DD strings (UTC-based, so DST never shifts a day). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(date: string): string {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((dow + 6) % 7));
}

function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function daysBetween(range: DateRange): number {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / 86_400_000) + 1;
}

export function resolvePeriod(period: Period, timeZone: string, now: Date = new Date()): DateRange {
  const today = localToday(timeZone, now);
  switch (period.preset) {
    case 'custom':
      return period.from <= period.to ? { from: period.from, to: period.to } : { from: period.to, to: period.from };
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const y = addDays(today, -1);
      return { from: y, to: y };
    }
    case 'this_week':
      return { from: startOfWeek(today), to: today };
    case 'last_7':
      return { from: addDays(today, -6), to: today };
    case 'this_month':
      return { from: startOfMonth(today), to: today };
    case 'last_month': {
      const lastDay = addDays(startOfMonth(today), -1);
      return { from: startOfMonth(lastDay), to: lastDay };
    }
    case 'last_30':
      return { from: addDays(today, -29), to: today };
    case 'this_year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** Serialize for URLs: `today` or `2026-01-01_2026-01-31`. */
export function periodToParam(period: Period): string {
  return period.preset === 'custom' ? `${period.from}_${period.to}` : period.preset;
}

export function periodFromParam(value: string | null, fallback: Period = { preset: 'today' }): Period {
  if (!value) return fallback;
  if ((PERIOD_PRESETS as readonly string[]).includes(value)) return { preset: value as PeriodPreset };
  const [from = '', to = ''] = value.split('_');
  if (isIsoDate(from) && isIsoDate(to)) return { preset: 'custom', from, to };
  return fallback;
}
