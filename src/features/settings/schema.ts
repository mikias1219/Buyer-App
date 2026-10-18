import { z } from 'zod';

export const TIMEZONES = ['Africa/Addis_Ababa', 'Africa/Nairobi', 'UTC'] as const;

/** Owner settings form (SPEC A3, shop_settings). Messages are i18n keys. */
export const settingsSchema = z
  .object({
    shop_name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
    timezone: z.enum(TIMEZONES),
    receipt_footer: z.string().trim().max(200, 'validation.tooLong'),
    default_reorder_level: z.number({ error: 'validation.required' }).min(0, 'validation.min0').max(100_000, 'validation.tooBig'),
    slow_mover_days: z.number({ error: 'validation.required' }).int().min(1, 'validation.range1to365').max(365, 'validation.range1to365'),
    allow_negative_stock: z.boolean(),
    staff_can_restock: z.boolean(),
    staff_can_sell_below_cost: z.boolean(),
    low_stock_alerts: z.boolean(),
    daily_summary_enabled: z.boolean(),
    daily_summary_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.time'),
  })
  .strict();

export type SettingsForm = z.infer<typeof settingsSchema>;
