import { AlertTriangle, BarChart3, Clock, Eye, Heart, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, Card, ListingStatusBadge, Notice } from '../../../components/ui';
import type { ListingDetail } from '../../../lib/api/types';
import { formatDate } from '../../../lib/format';
import { ownerActions } from '../logic';
import { ACTION_ICONS, useOwnerActions } from '../useOwnerActions';

/** Owner's view on their own listing: status, why it is not live, stats and next actions. */
export function OwnerPanel({ listing }: { listing: ListingDetail }) {
  const { t, i18n } = useTranslation();
  const m = listing.manage;
  const { run, busy } = useOwnerActions();
  if (!m) return null;
  const actions = ownerActions({
    status: m.status,
    published_at: listing.published_at,
    is_featured: listing.is_featured,
    open_payment: m.open_payment,
  });
  const ref = { id: listing.id, open_payment: m.open_payment };

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{t('owner.yourListing')}</p>
        <ListingStatusBadge status={m.status} />
      </div>
      <p className="text-sm text-hint">{t(`owner.statusHelp.${m.status}`)}</p>
      {m.reject_reason ? (
        <Notice tone="danger" icon={AlertTriangle} title={t(`rejectReason.${m.reject_reason}`)}>
          {m.reject_note || t('owner.fixHint')}
        </Notice>
      ) : null}
      {m.status === 'active' && listing.expires_at ? (
        <p className="flex items-center gap-1.5 text-xs text-hint">
          <Clock aria-hidden className="size-3.5" /> {t('owner.expiresOn', { date: formatDate(listing.expires_at, i18n.language) })}
        </p>
      ) : null}
      <dl className="grid grid-cols-3 gap-2 text-center">
        {[
          { icon: Eye, label: t('owner.views'), value: listing.views },
          { icon: Heart, label: t('owner.saves'), value: listing.favorites_count },
          { icon: MessageCircle, label: t('owner.contacts'), value: m.leads_count },
        ].map((s) => (
          <div key={s.label} className="rounded-input bg-surface-2 py-2">
            <dt className="flex items-center justify-center gap-1 text-[11px] text-hint">
              <s.icon aria-hidden className="size-3.5" />
              {s.label}
            </dt>
            <dd className="tabular text-base font-bold">{s.value}</dd>
          </div>
        ))}
      </dl>
      {actions.length ? (
        <div className="grid grid-cols-2 gap-2">
          {actions.map((a, i) => (
            <Button
              key={a}
              variant={i === 0 ? 'primary' : a === 'delete' ? 'danger' : 'secondary'}
              icon={ACTION_ICONS[a]}
              disabled={busy}
              className={i === 0 && actions.length % 2 === 1 ? 'col-span-2' : undefined}
              onClick={() => run(a, ref)}
            >
              {t(`owner.action.${a}`)}
            </Button>
          ))}
        </div>
      ) : null}
      {m.flags.length ? (
        <p className="flex items-center gap-1.5 text-xs text-hint">
          <BarChart3 aria-hidden className="size-3.5" /> {t('owner.flagged')}
        </p>
      ) : null}
    </Card>
  );
}
