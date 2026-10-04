import { BadgeCheck, Ban, Search, ShieldCheck, Undo2, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, BottomSheet, Button, Card, Chip, EmptyState, ErrorState, Input, ListingStatusBadge, PaymentStatusBadge, RatingDisplay, Select, Skeleton, Toggle, toast } from '../../../components/ui';
import type { AdminUser, Role } from '../../../lib/api/types';
import { formatDate, formatEtb, formatRelative } from '../../../lib/format';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useAdminUser, useAdminUsers, useSetBan, useSetRole, useSetVerified } from '../api';

const FILTERS = ['all', 'banned', 'staff', 'verified'] as const;

export default function UsersPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const users = useAdminUsers(search.trim(), filter);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('admin.users.title')}</h1>
      <Input leading={<Search aria-hidden className="size-5" />} placeholder={t('admin.users.search')} aria-label={t('admin.users.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => (
          <Chip key={f} selected={filter === f} onClick={() => setFilter(f)}>
            {t(`admin.users.filters.${f}`)}
          </Chip>
        ))}
      </div>
      {users.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : users.isError ? (
        <ErrorState error={users.error} onRetry={() => void users.refetch()} />
      ) : users.data.length === 0 ? (
        <EmptyState icon={Users} title={t('admin.users.empty')} />
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card">
          {users.data.map((u) => (
            <li key={u.public_id}>
              <button type="button" onClick={() => setSelected(u.public_id)} className="press flex min-h-16 w-full items-center gap-3 px-4 py-2 text-left">
                <Avatar name={u.first_name} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 truncate text-sm font-semibold">
                    {u.first_name || '—'}
                    {u.is_verified_seller ? <BadgeCheck aria-hidden className="size-4 text-brand" /> : null}
                  </p>
                  <p className="truncate text-xs text-hint">
                    {u.username ? `@${u.username}` : u.telegram_id} · {t('admin.users.joined', { when: formatRelative(u.created_at, i18n.language) })}
                  </p>
                </div>
                <UserBadges user={u} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected ? <UserSheet publicId={selected} onClose={() => setSelected(null)} /> : null}
    </div>
  );
}

function UserBadges({ user }: { user: AdminUser }) {
  const { t } = useTranslation();
  return (
    <span className="flex flex-col items-end gap-1">
      {user.is_banned ? <Badge tone="danger">{t('admin.users.banned')}</Badge> : null}
      {user.role !== 'user' ? <Badge tone="brand">{t(`role.${user.role}`)}</Badge> : null}
    </span>
  );
}

function UserSheet({ publicId, onClose }: { publicId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const errorMessage = useErrorMessage();
  const user = useAdminUser(publicId);
  const setRole = useSetRole();
  const setBan = useSetBan();
  const setVerified = useSetVerified();
  const [banReason, setBanReason] = useState('');
  const done = (msg: string) => ({ onSuccess: () => toast.success(msg), onError: (e: unknown) => toast.error(errorMessage(e)) });
  const u = user.data;

  return (
    <BottomSheet open onClose={onClose} title={u ? u.first_name || t('seller.anonymous') : t('common.loading')} size="tall">
      {user.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : user.isError ? (
        <ErrorState error={user.error} onRetry={() => void user.refetch()} />
      ) : u ? (
        <div className="space-y-4 pb-4">
          <Card className="space-y-1 bg-surface-2 shadow-none">
            <p className="text-sm">{u.username ? `@${u.username}` : t('profile.noUsername')}</p>
            <p className="text-xs text-hint">
              ID {u.telegram_id} · {u.phone || '—'} ({u.phone_verified ? t('profile.phoneVerified') : t('profile.phoneNotVerified')}) · {u.city || '—'}
            </p>
            <p className="text-xs text-hint">
              {t('seller.memberSince', { date: formatDate(u.created_at, i18n.language) })} · {t('admin.users.lastSeen', { when: formatRelative(u.last_seen_at, i18n.language) })}
            </p>
            <RatingDisplay rating={u.rating.rating} count={u.rating.count} />
            <p className="text-xs text-hint">{t('admin.users.reports', { against: u.reports_against, filed: u.reports_filed })}</p>
          </Card>

          <Select
            label={t('admin.users.role')}
            value={u.role}
            options={(['user', 'moderator', 'admin'] as Role[]).map((r) => ({ value: r, label: t(`role.${r}`) }))}
            onChange={(e) => setRole.mutate({ publicId, role: e.target.value as Role }, done(t('admin.users.roleChanged')))}
          />
          <Toggle
            label={t('admin.users.verifiedSeller')}
            description={t('admin.users.verifiedHelp')}
            checked={u.is_verified_seller}
            onChange={(v) => setVerified.mutate({ publicId, verified: v }, done(t('admin.saved')))}
          />

          {u.is_banned ? (
            <Card className="space-y-2 bg-danger-soft shadow-none">
              <p className="text-sm font-semibold text-danger">{t('admin.users.bannedFor', { reason: u.ban_reason })}</p>
              <Button size="sm" variant="secondary" icon={Undo2} loading={setBan.isPending} onClick={() => setBan.mutate({ publicId, banned: false }, done(t('admin.users.unbanned')))}>
                {t('admin.users.unban')}
              </Button>
            </Card>
          ) : (
            <div className="space-y-2">
              <Input label={t('admin.users.banReason')} value={banReason} onChange={(e) => setBanReason(e.target.value)} maxLength={300} />
              <Button
                variant="danger"
                icon={Ban}
                disabled={!banReason.trim()}
                loading={setBan.isPending}
                onClick={() => setBan.mutate({ publicId, banned: true, reason: banReason.trim() }, done(t('admin.users.bannedToast')))}
              >
                {t('admin.users.ban')}
              </Button>
            </div>
          )}

          <section className="space-y-1.5">
            <h3 className="flex items-center gap-1.5 text-sm font-bold">
              <ShieldCheck aria-hidden className="size-4" /> {t('admin.users.listings', { count: u.listing_count })}
            </h3>
            {u.listings.slice(0, 10).map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{l.title || '—'}</span>
                <ListingStatusBadge status={l.status} />
              </div>
            ))}
          </section>
          <section className="space-y-1.5">
            <h3 className="text-sm font-bold">{t('admin.users.payments')}</h3>
            {u.payments.length === 0 ? <p className="text-xs text-hint">—</p> : null}
            {u.payments.slice(0, 10).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="tabular font-mono text-xs">{p.reference || '—'}</span>
                <span className="tabular">{formatEtb(p.amount_etb)}</span>
                <PaymentStatusBadge status={p.status} />
              </div>
            ))}
          </section>
        </div>
      ) : null}
    </BottomSheet>
  );
}
