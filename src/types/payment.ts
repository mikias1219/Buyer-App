export type PaymentStatus =
  | 'pending'
  | 'submitted'
  | 'confirmed'
  | 'rejected'
  | 'refunded';

export interface Payment {
  id: string;
  telegram_id: string;
  product_id: string;
  amount_etb: number;
  method: string;
  reference: string;
  status: PaymentStatus;
  admin_note: string;
  created_at: string;
  updated_at: string;
}
