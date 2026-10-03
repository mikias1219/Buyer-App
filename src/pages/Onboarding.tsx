import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  PageHeader,
  PrimaryButton,
  SectionCard,
  fieldClass,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useTelegramContext } from '../context/TelegramContext';

export function Onboarding() {
  const { user } = useTelegramContext();
  const { profile, hasPhone, saveProfile, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from || '/';

  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!loading && hasPhone) {
    return <Navigate to={from} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const cleaned = phone.replace(/\s+/g, '').trim();
    if (!/^(\+251|0)?9\d{8}$/.test(cleaned)) {
      setError('Enter a valid Ethiopian mobile (e.g. 09xxxxxxxx).');
      return;
    }
    setSaving(true);
    setError(null);
    const ok = await saveProfile({
      phone: cleaned,
      city: city.trim(),
      first_name: user?.first_name,
      username: user?.username,
    });
    setSaving(false);
    if (!ok) {
      setError('Could not save profile. Try again.');
      return;
    }
    navigate(from, { replace: true });
  }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Create seller profile"
        subtitle="One quick step before you can list items"
      />

      <SectionCard className="!p-0 overflow-hidden">
        <div className="flex items-center gap-3 bg-gradient-to-br from-[var(--tg-theme-button-color,#2481cc)] to-[#1a5f9e] px-4 py-4 text-white">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20 text-[18px] font-bold">
            {(user?.first_name?.[0] || 'T').toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[16px] font-semibold">
              {user?.first_name || 'Telegram user'}
            </p>
            <p className="truncate text-[13px] text-white/85">
              {user?.username ? `@${user.username}` : 'Signed in with Telegram'}
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Phone (required)
            </span>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="09xxxxxxxx"
              className={fieldClass}
              required
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              City (optional)
            </span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Addis Ababa"
              className={fieldClass}
            />
          </label>

          {error && (
            <p className="text-[13px] text-[var(--tg-theme-destructive-text-color,#ff3b30)]">
              {error}
            </p>
          )}

          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Continue'}
          </PrimaryButton>
        </form>
      </SectionCard>
    </div>
  );
}
