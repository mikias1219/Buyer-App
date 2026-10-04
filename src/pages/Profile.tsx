import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  InfoRow,
  PageHeader,
  PrimaryButton,
  SectionCard,
  SectionTitle,
  fieldClass,
} from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useTelegramContext } from '../context/TelegramContext';
import { isSupabaseConfigured } from '../lib/supabaseClient';
import { formatETB } from '../utils/format';

export function Profile() {
  const { user, colorScheme, tg } = useTelegramContext();
  const { profile, hasPhone, isAdmin, saveProfile, settings } = useAuth();
  const { myProducts, usingMockData } = useProducts();
  const [phone, setPhone] = useState(profile?.phone || '');
  const [city, setCity] = useState(profile?.city || '');
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy screen, replaced in Phase 2
    setPhone(profile?.phone || '');
    setCity(profile?.city || '');
  }, [profile?.phone, profile?.city]);

  const liveCount = useMemo(
    () => myProducts.filter((p) => p.status === 'active').length,
    [myProducts],
  );
  const pendingCount = useMemo(
    () =>
      myProducts.filter(
        (p) => p.status === 'pending_payment' || p.status === 'payment_submitted',
      ).length,
    [myProducts],
  );

  const displayName = `${user?.first_name || 'User'}${user?.last_name ? ` ${user.last_name}` : ''}`;
  const initials = (user?.first_name?.[0] || '?').toUpperCase();
  const realId = user?.id && user.id !== 0 ? user.id : null;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    const ok = await saveProfile({
      phone: phone.replace(/\s+/g, '').trim(),
      city: city.trim(),
    });
    setSaving(false);
    setMsg(ok ? 'Profile saved.' : 'Could not save.');
  }

  async function copyId() {
    if (!realId) return;
    try {
      await navigator.clipboard.writeText(String(realId));
      tg?.showAlert?.('Telegram ID copied');
      setMsg('Telegram ID copied.');
    } catch {
      setMsg(String(realId));
    }
  }

  return (
    <div className="space-y-3.5">
      <PageHeader title="Profile" subtitle="Your seller identity on TechMarket ET" />

      {/* Identity hero */}
      <SectionCard className="!p-0 overflow-hidden">
        <div className="bg-gradient-to-br from-[var(--tg-theme-button-color,#2481cc)] to-[#1a5f9e] px-4 pb-5 pt-5 text-[var(--tg-theme-button-text-color,#fff)]">
          <div className="flex items-center gap-3.5">
            {user?.photo_url ? (
              <img
                src={user.photo_url}
                alt=""
                className="h-16 w-16 rounded-full object-cover ring-2 ring-white/40"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-[24px] font-bold ring-2 ring-white/30">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-[20px] font-bold leading-tight">{displayName}</p>
              <p className="mt-0.5 truncate text-[14px] text-white/85">
                {user?.username ? `@${user.username}` : 'No @username set'}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hasPhone ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                    Verified contact
                  </span>
                ) : (
                  <span className="rounded-full bg-amber-400/90 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
                    Phone needed
                  </span>
                )}
                {isAdmin ? (
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-semibold">
                    Admin
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x divide-black/8 dark:divide-white/10">
          <div className="px-2 py-3 text-center">
            <p className="text-[18px] font-bold tabular-nums">{myProducts.length}</p>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">Listings</p>
          </div>
          <div className="px-2 py-3 text-center">
            <p className="text-[18px] font-bold tabular-nums text-emerald-600">{liveCount}</p>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">Live</p>
          </div>
          <div className="px-2 py-3 text-center">
            <p className="text-[18px] font-bold tabular-nums text-amber-600">{pendingCount}</p>
            <p className="text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">Pending</p>
          </div>
        </div>
      </SectionCard>

      {/* Telegram ID */}
      <SectionCard>
        <SectionTitle title="Telegram ID" />
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3.5 py-3">
          <p className="text-[22px] font-bold tabular-nums tracking-wide">
            {realId ?? 'Open in Telegram'}
          </p>
          {realId ? (
            <button
              type="button"
              onClick={() => void copyId()}
              className="shrink-0 rounded-xl bg-[var(--tg-theme-button-color,#2481cc)] px-3.5 py-2 text-[13px] font-semibold text-white"
            >
              Copy
            </button>
          ) : null}
        </div>
        {!realId && (
          <p className="mt-2 text-[12px] leading-snug text-amber-800 dark:text-amber-200">
            Open the Mini App from your bot menu inside Telegram to load your real ID.
          </p>
        )}
      </SectionCard>

      {/* Account info */}
      <SectionCard>
        <SectionTitle title="Account" />
        <dl className="divide-y divide-black/8 dark:divide-white/10">
          <InfoRow label="Phone" value={profile?.phone || 'Not set'} />
          <InfoRow label="City" value={profile?.city || 'Not set'} />
          <InfoRow label="Theme" value={colorScheme} />
          <InfoRow label="Platform" value={tg?.platform || 'browser'} />
          <InfoRow
            label="Data"
            value={usingMockData || !isSupabaseConfigured ? 'Demo' : 'Live'}
          />
          <InfoRow label="Listing fee" value={formatETB(settings.listing_fee_etb)} mono />
        </dl>
      </SectionCard>

      {!hasPhone && (
        <Link
          to="/onboarding"
          className="block rounded-2xl bg-amber-500/15 px-4 py-3.5 text-[14px] font-semibold text-amber-950 dark:text-amber-100"
        >
          Complete phone number to start selling →
        </Link>
      )}

      {/* Edit contact */}
      <SectionCard>
        <SectionTitle title="Edit contact" />
        <form onSubmit={onSave} className="space-y-3">
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Phone
            </span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={fieldClass}
              placeholder="09xxxxxxxx"
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              City
            </span>
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={fieldClass}
              placeholder="Addis Ababa"
            />
          </label>
          {msg && (
            <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">{msg}</p>
          )}
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save profile'}
          </PrimaryButton>
        </form>
      </SectionCard>

      <SectionCard>
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-[16px] font-semibold">My listings</h2>
            <p className="mt-0.5 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
              Manage status and payments
            </p>
          </div>
          <Link
            to="/my-listings"
            className="rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)] px-3 py-2 text-[13px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
          >
            Open
          </Link>
        </div>
      </SectionCard>

      {isAdmin && (
        <Link
          to="/admin"
          className="block rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] px-4 py-4 text-center text-[16px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] shadow-sm"
        >
          Open Admin Dashboard
        </Link>
      )}
    </div>
  );
}
