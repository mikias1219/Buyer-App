import {
  BadgeCheck,
  Heart,
  Languages,
  LayoutDashboard,
  LifeBuoy,
  MapPin,
  Phone,
  Send,
  ShieldCheck,
  Store,
} from 'lucide-react';
import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Avatar, Badge, BottomSheet, Card, EmptyState, ErrorState, ListGroup, ListItem, Notice, Select, Skeleton, VerifiedBadge, cn, toast } from '../../components/ui';
import type { Language } from '../../lib/api/types';
import { formatEtb } from '../../lib/format';
import { openTelegramLink } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useChangeLanguage, useMe, usePermissions, useSettings, useUpdateProfile } from '../auth/hooks';
import { useSession } from '../auth/session';
import { CITIES } from '../listings/schema';

// Demo-only role switcher; compiled out of production builds.
const MockUserSwitcher =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? lazy(() => import('../../lib/api/mock/MockUserSwitcher')) : null;

export default function ProfilePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const me = useMe();
  const settings = useSettings();
  const perms = usePermissions(me.data);
  const changeLanguage = useChangeLanguage();
  const updateProfile = useUpdateProfile();
  const errorMessage = useErrorMessage();
  const [sheet, setSheet] = useState<'language' | 'city' | 'safety' | null>(null);

  const languageRow = (
    <ListItem icon={Languages} label={t('profile.language')} value={i18n.language === 'am' ? 'አማርኛ' : 'English'} onClick={() => setSheet('language')} />
  );

  if (session.status === 'guest') {
    return (
      <div className="space-y-4">
        <EmptyState icon={Send} title={t('guards.openInTelegramTitle')} description={t('guards.openInTelegramBody')} />
        <ListGroup>{languageRow}</ListGroup>
        <LanguageSheet open={sheet === 'language'} onClose={() => setSheet(null)} onPick={(l) => { changeLanguage(l); setSheet(null); }} />
      </div>
    );
  }
  if (me.isPending) {
    return (
      <div className="space-y-4" role="status" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} />;
  const u = me.data;
  const support = settings.data?.support_username;

  return (
    <div className="space-y-5">
      <Card className="flex items-center gap-4">
        <Avatar name={u.first_name} url={u.photo_url || null} size={64} />
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-1.5 text-lg font-bold">
            <span className="truncate">{[u.first_name, u.last_name].filter(Boolean).join(' ') || t('seller.anonymous')}</span>
            {u.is_verified_seller ? <VerifiedBadge /> : null}
          </h1>
          <p className="truncate text-sm text-hint">{u.username ? `@${u.username}` : t('profile.noUsername')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {u.role !== 'user' ? <Badge tone="brand">{t(`role.${u.role}`)}</Badge> : null}
            {u.phone_verified ? (
              <Badge tone="success" icon={BadgeCheck}>
                {t('profile.phoneVerified')}
              </Badge>
            ) : (
              <Badge tone="warning">{t('profile.phoneNotVerified')}</Badge>
            )}
          </div>
        </div>
      </Card>

      {u.is_banned ? (
        <Notice tone="danger" title={t('guards.bannedTitle')}>
          {u.ban_reason || t('guards.bannedBody')}
        </Notice>
      ) : null}

      {!u.username ? (
        <Notice tone="warning" title={t('profile.usernameTipTitle')}>
          {t('profile.usernameTipBody')}
        </Notice>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Card className="p-3.5">
          <p className="text-xs text-hint">{t('profile.freeLeft')}</p>
          <p className="tabular text-xl font-bold">{u.free_listings_left}</p>
        </Card>
        <Card className="p-3.5">
          <p className="text-xs text-hint">{t('profile.openListings')}</p>
          <p className="tabular text-xl font-bold">
            {u.open_listings}
            {settings.data ? <span className="text-sm font-normal text-hint"> / {settings.data.max_active_listings}</span> : null}
          </p>
        </Card>
      </div>

      {perms.isStaff ? (
        <ListGroup>
          <ListItem icon={LayoutDashboard} label={t('profile.admin')} to="/admin" />
        </ListGroup>
      ) : null}

      <ListGroup>
        <ListItem icon={Store} label={t('nav.mine')} to="/mine" />
        <ListItem icon={Heart} label={t('nav.saved')} to="/favorites" />
        <ListItem
          icon={Phone}
          label={t('profile.phone')}
          value={u.phone_verified ? (u.phone_masked ?? '') : t('profile.verifyNow')}
          {...(u.phone_verified ? {} : { onClick: () => navigate('/verify-phone?next=/profile') })}
        />
        <ListItem icon={MapPin} label={t('fields.city')} value={u.city || t('profile.notSet')} onClick={() => setSheet('city')} />
        {languageRow}
      </ListGroup>

      <ListGroup>
        <ListItem icon={ShieldCheck} label={t('profile.safety')} onClick={() => setSheet('safety')} />
        {support ? <ListItem icon={LifeBuoy} label={t('profile.support')} value={`@${support}`} onClick={() => openTelegramLink(`https://t.me/${support}`)} /> : null}
      </ListGroup>

      {settings.data ? (
        <p className="px-1 text-center text-xs text-hint">
          {t('profile.pricing', {
            quota: settings.data.free_listings_quota,
            fee: formatEtb(settings.data.listing_fee_etb),
            days: settings.data.listing_duration_days,
          })}
        </p>
      ) : null}

      {session.mock && MockUserSwitcher ? (
        <Suspense fallback={null}>
          <MockUserSwitcher current={u.telegram_id} />
        </Suspense>
      ) : null}

      <LanguageSheet open={sheet === 'language'} onClose={() => setSheet(null)} onPick={(l) => { changeLanguage(l); setSheet(null); }} />
      <BottomSheet open={sheet === 'city'} onClose={() => setSheet(null)} title={t('profile.cityTitle')} description={t('profile.cityHelp')}>
        <Select
          label={t('fields.city')}
          value={u.city}
          placeholder={t('profile.notSet')}
          options={CITIES.map((c) => ({ value: c, label: c }))}
          onChange={(e) =>
            updateProfile.mutate(
              { city: e.target.value },
              { onSuccess: () => { toast.success(t('profile.saved')); setSheet(null); }, onError: (err) => toast.error(errorMessage(err)) },
            )
          }
        />
      </BottomSheet>
      <BottomSheet open={sheet === 'safety'} onClose={() => setSheet(null)} title={t('profile.safety')}>
        <ul className="space-y-3 pb-2">
          {(['safetyMeet', 'safetyCheck', 'safetyNoAdvance', 'safetyReport'] as const).map((k) => (
            <li key={k} className="flex gap-2.5 text-sm">
              <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
              {t(`contact.${k}`)}
            </li>
          ))}
        </ul>
      </BottomSheet>
    </div>
  );
}

function LanguageSheet({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (l: Language) => void }) {
  const { t, i18n } = useTranslation();
  return (
    <BottomSheet open={open} onClose={onClose} title={t('profile.language')}>
      <div className="grid gap-2 pb-2">
        {(
          [
            ['en', 'English'],
            ['am', 'አማርኛ'],
          ] as const
        ).map(([code, label]) => (
          <button
            key={code}
            type="button"
            aria-pressed={i18n.language === code}
            onClick={() => onPick(code)}
            className={cn(
              'press min-h-12 rounded-input border px-4 text-left text-base font-semibold',
              i18n.language === code ? 'border-brand bg-brand-soft text-brand' : 'border-line',
            )}
          >
            {label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
}
