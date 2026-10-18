import { z } from 'zod';
import { EXPENSE_CATEGORIES } from '../../lib/api/types';
import { isIsoDate } from '../../lib/period';

export const expenseSchema = z.object({
  spent_on: z.string().refine(isIsoDate, 'validation.date'),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.number({ error: 'validation.required' }).positive('validation.positive').max(1e10, 'validation.tooBig'),
  note: z.string().trim().max(300, 'validation.tooLong'),
});
export type ExpenseForm = z.infer<typeof expenseSchema>;
