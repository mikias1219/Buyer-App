import { describe, expect, it } from 'vitest';
import { settingsSchema, type SettingsForm } from './schema';

const valid: SettingsForm = {
  shop_name: 'Abebe Electronics',
  timezone: 'Africa/Addis_Ababa',
  receipt_footer: 'Thank you',
  default_reorder_level: 5,
  slow_mover_days: 30,
  allow_negative_stock: false,
  staff_can_restock: false,
  staff_can_sell_below_cost: false,
  low_stock_alerts: true,
  daily_summary_enabled: true,
  daily_summary_time: '21:00',
};

const issue = (input: unknown) => settingsSchema.safeParse(input).error?.issues[0]?.message;

describe('settingsSchema', () => {
  it('accepts a complete form and trims text', () => {
    expect(settingsSchema.parse({ ...valid, shop_name: '  My shop ' }).shop_name).toBe('My shop');
  });
  it('requires a shop name', () => {
    expect(issue({ ...valid, shop_name: '   ' })).toBe('validation.required');
  });
  it('limits numbers', () => {
    expect(issue({ ...valid, default_reorder_level: -1 })).toBe('validation.min0');
    expect(issue({ ...valid, slow_mover_days: 0 })).toBe('validation.range1to365');
    expect(issue({ ...valid, slow_mover_days: 400 })).toBe('validation.range1to365');
  });
  it('validates the summary time and time zone', () => {
    expect(issue({ ...valid, daily_summary_time: '25:00' })).toBe('validation.time');
    expect(settingsSchema.safeParse({ ...valid, timezone: 'Mars/Base' }).success).toBe(false);
  });
  it('rejects unknown fields', () => {
    expect(settingsSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
  });
});
