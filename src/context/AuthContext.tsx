import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { upsertProfile, updateProfile } from '../lib/api/profiles';
import { fetchSettings } from '../lib/api/settings';
import type { Profile, ProfileUpdate } from '../types/profile';
import type { PlatformSettings } from '../types/settings';
import { DEFAULT_SETTINGS } from '../types/settings';
import { useTelegramContext } from './TelegramContext';

interface AuthContextValue {
  profile: Profile | null;
  settings: PlatformSettings;
  loading: boolean;
  hasPhone: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  telegramId: string;
  refreshProfile: () => Promise<void>;
  saveProfile: (patch: ProfileUpdate) => Promise<boolean>;
  refreshSettings: () => Promise<void>;
  setSettingsLocal: (s: PlatformSettings) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { user, isReady } = useTelegramContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<PlatformSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  const telegramId = String(user?.id ?? '0');

  const refreshSettings = useCallback(async () => {
    const s = await fetchSettings();
    setSettings(s);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!user) return;
    const p = await upsertProfile({
      telegram_id: String(user.id),
      username: user.username,
      first_name: user.first_name,
    });
    setProfile(p);
  }, [user]);

  useEffect(() => {
    if (!isReady) return;
    let cancelled = false;

    async function boot() {
      setLoading(true);
      await refreshSettings();
      if (!cancelled) await refreshProfile();
      if (!cancelled) setLoading(false);
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [isReady, refreshProfile, refreshSettings]);

  const saveProfile = useCallback(
    async (patch: ProfileUpdate) => {
      const updated = await updateProfile(telegramId, patch);
      if (!updated) return false;
      setProfile(updated);
      return true;
    },
    [telegramId],
  );

  const hasPhone = Boolean(profile?.phone?.trim());
  const isBanned = Boolean(profile?.is_banned);
  const isAdmin = Boolean(
    profile?.role === 'admin' ||
      settings.admin_telegram_ids.map(String).includes(telegramId) ||
      // Browser preview: treat guest as admin when no admins configured yet
      (telegramId === '0' && settings.admin_telegram_ids.length === 0),
  );

  const value = useMemo(
    () => ({
      profile,
      settings,
      loading,
      hasPhone,
      isAdmin,
      isBanned,
      telegramId,
      refreshProfile,
      saveProfile,
      refreshSettings,
      setSettingsLocal: setSettings,
    }),
    [
      profile,
      settings,
      loading,
      hasPhone,
      isAdmin,
      isBanned,
      telegramId,
      refreshProfile,
      saveProfile,
      refreshSettings,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
