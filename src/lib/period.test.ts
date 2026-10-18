import { describe, expect, it } from 'vitest';
import { addDays, daysBetween, isIsoDate, localToday, periodFromParam, periodToParam, resolvePeriod } from './period';

const TZ = 'Africa/Addis_Ababa'; // UTC+3, no DST

describe('localToday', () => {
  it('uses the shop time zone, not UTC', () => {
    // 22:30 UTC on Jan 1 is 01:30 on Jan 2 in Addis Ababa.
    expect(localToday(TZ, new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-02');
    expect(localToday('UTC', new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
  });
  it('falls back to UTC for unknown zones', () => {
    expect(localToday('Mars/Base', new Date('2026-01-01T22:30:00Z'))).toBe('2026-01-01');
  });
});

describe('resolvePeriod', () => {
  // Wednesday 2026-10-14, 10:00 in Addis.
  const now = new Date('2026-10-14T07:00:00Z');
  const r = (preset: Parameters<typeof resolvePeriod>[0]) => resolvePeriod(preset, TZ, now);

  it('today and yesterday', () => {
    expect(r({ preset: 'today' })).toEqual({ from: '2026-10-14', to: '2026-10-14' });
    expect(r({ preset: 'yesterday' })).toEqual({ from: '2026-10-13', to: '2026-10-13' });
  });
  it('weeks start on Monday', () => {
    expect(r({ preset: 'this_week' })).toEqual({ from: '2026-10-12', to: '2026-10-14' });
    // A Sunday belongs to the week that started the previous Monday.
    expect(resolvePeriod({ preset: 'this_week' }, TZ, new Date('2026-10-18T07:00:00Z')).from).toBe('2026-10-12');
  });
  it('rolling windows include today', () => {
    expect(r({ preset: 'last_7' })).toEqual({ from: '2026-10-08', to: '2026-10-14' });
    expect(daysBetween(r({ preset: 'last_30' }))).toBe(30);
  });
  it('months and year', () => {
    expect(r({ preset: 'this_month' })).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    expect(r({ preset: 'last_month' })).toEqual({ from: '2026-09-01', to: '2026-09-30' });
    expect(resolvePeriod({ preset: 'last_month' }, TZ, new Date('2026-03-10T07:00:00Z'))).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(resolvePeriod({ preset: 'last_month' }, TZ, new Date('2026-01-10T07:00:00Z'))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(r({ preset: 'this_year' })).toEqual({ from: '2026-01-01', to: '2026-10-14' });
  });
  it('custom ranges are normalized', () => {
    expect(r({ preset: 'custom', from: '2026-02-10', to: '2026-02-01' })).toEqual({ from: '2026-02-01', to: '2026-02-10' });
  });
});

describe('period params', () => {
  it('round-trips presets and custom ranges', () => {
    expect(periodFromParam(periodToParam({ preset: 'this_month' }))).toEqual({ preset: 'this_month' });
    expect(periodFromParam(periodToParam({ preset: 'custom', from: '2026-01-01', to: '2026-01-31' }))).toEqual({
      preset: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
  it('rejects garbage', () => {
    expect(periodFromParam('nonsense')).toEqual({ preset: 'today' });
    expect(periodFromParam('2026-02-30_2026-03-01')).toEqual({ preset: 'today' });
    expect(periodFromParam(null, { preset: 'this_week' })).toEqual({ preset: 'this_week' });
  });
  it('date helpers', () => {
    expect(isIsoDate('2026-02-29')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});
