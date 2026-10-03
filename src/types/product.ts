export type ProductCategory = 'Laptop' | 'Phone' | 'Tablet' | 'Accessory' | 'Other';

export type ProductCondition = 'New' | 'Like New' | 'Good' | 'Fair';

export type ProductStatus =
  | 'draft'
  | 'pending_payment'
  | 'payment_submitted'
  | 'active'
  | 'rejected'
  | 'sold'
  | 'hidden';

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  category: ProductCategory;
  condition: ProductCondition;
  image_url: string;
  seller_id: string;
  seller_username: string;
  created_at: string;
  status: ProductStatus;
  brand: string;
  city: string;
  listing_fee_etb: number;
  payment_id: string | null;
}

export interface NewProductInput {
  title: string;
  description: string;
  price: number;
  category: ProductCategory;
  condition: ProductCondition;
  image_url: string;
  brand?: string;
  city?: string;
}
