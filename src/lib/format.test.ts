import { describe, expect, it } from 'vitest';
import { formatDate, formatEtb, formatNumber, formatRelative, groupThousands, parseAmount, percentChange } from './format';

describe('format', () => {
  it('formats ETB with thousands separators and cents only when present', () => {
    expect(formatEtb(25000)).toBe('ETB 25,000');
    expect(formatEtb(40.5)).toBe('ETB 40.50');
    expect(formatEtb(1234567.6)).toBe('ETB 1,234,567.60');
    expect(formatEtb(0.004)).toBe('ETB 0');
    expect(formatEtb(null)).toBe('ETB —');
  });
  it('signs profit and losses', () => {
    expect(formatEtb(1500, { signed: true })).toBe('+ETB 1,500');
    expect(formatEtb(-230, { signed: true })).toBe('−ETB 230');
    expect(formatEtb(-230)).toBe('−ETB 230');
    expect(formatEtb(0, { signed: true })).toBe('ETB 0');
  });
  it('formats quantities', () => {
    expect(formatNumber(12)).toBe('12');
    expect(formatNumber(90.75)).toBe('90.75');
    expect(formatNumber(1234.5)).toBe('1,234.5');
  });
  it('percent change', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 200)).toBe(-75);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(-50, -100)).toBe(50);
  });
  it('parses and groups amounts typed by users', () => {
    expect(parseAmount('25,000')).toBe(25000);
    expect(parseAmount('25 000 ETB')).toBe(25000);
    expect(parseAmount('')).toBeNull();
    expect(groupThousands('45000')).toBe('45,000');
    expect(groupThousands('abc')).toBe('');
  });
  it('relative time in English', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    expect(formatRelative('2026-10-04T09:00:00Z', 'en', now)).toBe('3 hours ago');
    expect(formatRelative('2026-10-02T12:00:00Z', 'en', now)).toBe('2 days ago');
    expect(formatRelative(null, 'en', now)).toBe('');
  });
  it('calendar dates do not shift across time zones', () => {
    expect(formatDate('2026-01-02', 'en')).toBe('2 Jan 2026');
  });
});
