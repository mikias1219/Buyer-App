export type UserRole = 'user' | 'admin';

export interface Profile {
  telegram_id: string;
  username: string;
  first_name: string;
  phone: string;
  city: string;
  role: UserRole;
  is_banned: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileUpdate {
  phone?: string;
  city?: string;
  first_name?: string;
  username?: string;
}
