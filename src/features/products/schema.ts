import { z } from 'zod';
import { UNITS } from '../../lib/api/types';
import { isValidQty } from './logic';

/** Product form (SPEC A5.2). Messages are i18n keys. */
export const productSchema = z
  .object({
    name: z.string().trim().min(1, 'validation.required').max(120, 'validation.tooLong'),
    category_id: z.string().nullable(),
    unit: z.enum(UNITS),
    sell_price: z.number({ error: 'validation.required' }).min(0, 'validation.min0').max(1e10, 'validation.tooBig'),
    cost_price: z.number({ error: 'validation.required' }).min(0, 'validation.min0').max(1e10, 'validation.tooBig'),
    opening_stock: z.number().min(0, 'validation.min0').max(1e8, 'validation.tooBig').nullable(),
    reorder_level: z.number({ error: 'validation.required' }).min(0, 'validation.min0').max(1e8, 'validation.tooBig'),
    sku: z
      .string()
      .trim()
      .regex(/^([A-Za-z0-9._/-]{1,40})?$/, 'validation.sku'),
    barcode: z
      .string()
      .trim()
      .regex(/^([A-Za-z0-9-]{4,48})?$/, 'validation.barcode'),
    notes: z.string().trim().max(500, 'validation.tooLong'),
    image_path: z.string(),
  })
  .superRefine((v, ctx) => {
    if (v.opening_stock !== null && !isValidQty(v.unit, v.opening_stock)) {
      ctx.addIssue({ code: 'custom', path: ['opening_stock'], message: 'validation.wholeNumber' });
    }
  });

export type ProductForm = z.infer<typeof productSchema>;

export const restockSchema = z.object({
  qty: z.number({ error: 'validation.required' }).positive('validation.positive').max(1e8, 'validation.tooBig'),
  unit_cost: z.number().min(0, 'validation.min0').max(1e10, 'validation.tooBig').nullable(),
  supplier: z.string().trim().max(120, 'validation.tooLong'),
  note: z.string().trim().max(300, 'validation.tooLong'),
});
export type RestockForm = z.infer<typeof restockSchema>;

export const adjustSchema = z.object({
  mode: z.enum(['set', 'loss']),
  qty: z.number({ error: 'validation.required' }).min(0, 'validation.min0').max(1e8, 'validation.tooBig'),
  reason: z.string().trim().min(1, 'validation.required').max(300, 'validation.tooLong'),
});
export type AdjustForm = z.infer<typeof adjustSchema>;
