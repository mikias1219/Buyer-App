import { describe, expect, it } from 'vitest';
import { formatEtb, formatRelative, groupThousands, minutesSince, parseAmount } from './format';

describe('format', () => {
  it('formats ETB with thousands separators', () => {
    expect(formatEtb(25000)).toBe('ETB 25,000');
    expect(formatEtb(1234567.6)).toBe('ETB 1,234,568');
    expect(formatEtb(null)).toBe('ETB —');
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
  it('minutes since', () => {
    const now = Date.parse('2026-10-04T12:00:00Z');
    expect(minutesSince('2026-10-04T10:30:00Z', now)).toBe(90);
    expect(minutesSince(null, now)).toBe(0);
  });
});
