import { supabase, isSupabaseConfigured } from '../supabaseClient';
import type { Profile, ProfileUpdate } from '../../types/profile';

export async function upsertProfile(input: {
  telegram_id: string;
  username?: string;
  first_name?: string;
}): Promise<Profile | null> {
  const now = new Date().toISOString();
  const base: Profile = {
    telegram_id: input.telegram_id,
    username: input.username ?? '',
    first_name: input.first_name ?? '',
    phone: '',
    city: '',
    role: 'user',
    is_banned: false,
    created_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured || !supabase) {
    const key = `tm_profile_${input.telegram_id}`;
    const existing = localStorage.getItem(key);
    if (existing) {
      const parsed = JSON.parse(existing) as Profile;
      const merged = {
        ...parsed,
        username: input.username ?? parsed.username,
        first_name: input.first_name ?? parsed.first_name,
        updated_at: now,
      };
      localStorage.setItem(key, JSON.stringify(merged));
      return merged;
    }
    localStorage.setItem(key, JSON.stringify(base));
    return base;
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('telegram_id', input.telegram_id)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        username: input.username ?? existing.username,
        first_name: input.first_name ?? existing.first_name,
        updated_at: now,
      })
      .eq('telegram_id', input.telegram_id)
      .select()
      .single();

    if (error) {
      console.error('[profiles] update failed:', error.message);
      return existing as Profile;
    }
    return data as Profile;
  }

  const { data, error } = await supabase
    .from('profiles')
    .insert({
      telegram_id: input.telegram_id,
      username: input.username ?? '',
      first_name: input.first_name ?? '',
    })
    .select()
    .single();

  if (error) {
    console.error('[profiles] insert failed:', error.message);
    return null;
  }

  return data as Profile;
}

export async function updateProfile(
  telegramId: string,
  patch: ProfileUpdate,
): Promise<Profile | null> {
  const now = new Date().toISOString();

  if (!isSupabaseConfigured || !supabase) {
    const key = `tm_profile_${telegramId}`;
    const existing = localStorage.getItem(key);
    if (!existing) return null;
    const merged = { ...JSON.parse(existing), ...patch, updated_at: now } as Profile;
    localStorage.setItem(key, JSON.stringify(merged));
    return merged;
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: now })
    .eq('telegram_id', telegramId)
    .select()
    .single();

  if (error) {
    console.error('[profiles] patch failed:', error.message);
    return null;
  }

  return data as Profile;
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  if (!isSupabaseConfigured || !supabase) {
    const profiles: Profile[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('tm_profile_')) {
        profiles.push(JSON.parse(localStorage.getItem(key)!) as Profile);
      }
    }
    return profiles;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[profiles] list failed:', error.message);
    return [];
  }

  return (data as Profile[]) ?? [];
}

export async function setUserBanned(
  telegramId: string,
  isBanned: boolean,
): Promise<boolean> {
  if (!isSupabaseConfigured || !supabase) {
    const key = `tm_profile_${telegramId}`;
    const existing = localStorage.getItem(key);
    if (!existing) return false;
    const merged = { ...JSON.parse(existing), is_banned: isBanned } as Profile;
    localStorage.setItem(key, JSON.stringify(merged));
    return true;
  }

  const { error } = await supabase
    .from('profiles')
    .update({ is_banned: isBanned, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  if (error) {
    console.error('[profiles] ban failed:', error.message);
    return false;
  }
  return true;
}
