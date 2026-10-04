import { useEffect, useState } from 'react';
import { fetchAllProfiles, setUserBanned } from '../../lib/api/profiles';
import type { Profile } from '../../types/profile';

export function AdminUsers() {
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setUsers(await fetchAllProfiles());
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- legacy screen, replaced in Phase 2
    void load();
  }, []);

  async function toggleBan(user: Profile) {
    const ok = await setUserBanned(user.telegram_id, !user.is_banned);
    if (ok) await load();
  }

  if (loading) {
    return (
      <p className="text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">Loading users…</p>
    );
  }

  return (
    <div className="space-y-2">
      {users.length === 0 ? (
        <p className="rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] p-4 text-[13px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          No profiles yet. Users appear after opening the Mini App.
        </p>
      ) : (
        users.map((u) => (
          <div
            key={u.telegram_id}
            className="flex items-center justify-between gap-3 rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold">
                {u.first_name || 'User'}{' '}
                {u.username ? (
                  <span className="font-normal text-[var(--tg-theme-hint-color,#8e8e93)]">
                    @{u.username}
                  </span>
                ) : null}
              </p>
              <p className="text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                ID {u.telegram_id} · {u.phone || 'no phone'} · {u.city || '—'}
              </p>
              {u.is_banned && (
                <p className="text-[11px] font-semibold text-red-600">Banned</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => void toggleBan(u)}
              className={[
                'shrink-0 rounded-lg px-3 py-1.5 text-[12px] font-semibold',
                u.is_banned
                  ? 'bg-emerald-600 text-white'
                  : 'bg-red-500/15 text-red-700 dark:text-red-300',
              ].join(' ')}
            >
              {u.is_banned ? 'Unban' : 'Ban'}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
