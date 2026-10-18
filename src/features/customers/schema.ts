import { z } from 'zod';

export const customerSchema = z.object({
  name: z.string().trim().min(1, 'validation.required').max(80, 'validation.tooLong'),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(\+?[0-9]{9,15})?$/, 'validation.phone')),
  note: z.string().trim().max(300, 'validation.tooLong'),
});
export type CustomerForm = z.input<typeof customerSchema>;

export const paymentSchema = z.object({
  amount: z.number({ error: 'validation.required' }).positive('validation.positive'),
  method: z.enum(['cash', 'telebirr', 'bank']),
  note: z.string().trim().max(300, 'validation.tooLong'),
});
export type PaymentForm = z.infer<typeof paymentSchema>;
