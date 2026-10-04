import { ChevronDown, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, EmptyState, ErrorState, Select, Skeleton } from '../../../components/ui';
import type { AuditEntry } from '../../../lib/api/types';
import { formatRelative } from '../../../lib/format';
import { useAuditLog } from '../api';

const ACTIONS = ['', 'payment', 'listing', 'user', 'report', 'settings'] as const;

export default function AuditPage() {
  const { t } = useTranslation();
  const [action, setAction] = useState('');
  const log = useAuditLog(action, '');
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('admin.audit.title')}</h1>
      <Select
        label={t('admin.audit.filter')}
        value={action}
        options={ACTIONS.map((a) => ({ value: a, label: a ? t(`admin.audit.groups.${a}`) : t('admin.reports.all') }))}
        onChange={(e) => setAction(e.target.value)}
      />
      {log.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : log.data.length === 0 ? (
        <EmptyState icon={ScrollText} title={t('admin.audit.empty')} />
      ) : (
        <ul className="space-y-2">
          {log.data.map((e) => (
            <li key={e.id}>
              <AuditRow entry={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AuditRow({ entry: e }: { entry: AuditEntry }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const changes = diff(e.before, e.after);
  return (
    <Card className="p-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t(`admin.audit.actions.${e.action}`, { defaultValue: e.action })}</p>
          <p className="text-xs text-hint">
            {e.actor.name ?? t('admin.audit.system')}
            {e.actor.username ? ` @${e.actor.username}` : ''} · {formatRelative(e.created_at, i18n.language)} · {e.target_type} {e.target_id.slice(0, 8)}
          </p>
        </div>
        <ChevronDown aria-hidden className={`size-5 shrink-0 text-hint transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <dl className="mt-2 space-y-1 border-t border-line pt-2 text-xs">
          {changes.length === 0 ? <p className="text-hint">—</p> : null}
          {changes.map(([k, b, a]) => (
            <div key={k} className="grid grid-cols-[1fr_auto] gap-2">
              <dt className="font-mono text-hint">{k}</dt>
              <dd className="text-right">
                <span className="text-danger line-through">{b}</span> → <span className="text-success">{a}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Card>
  );
}

function diff(before: Record<string, unknown> | null, after: Record<string, unknown> | null): Array<[string, string, string]> {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  const show = (v: unknown) => (v === null || v === undefined ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return [...keys]
    .filter((k) => !['updated_at', 'created_at', 'id'].includes(k) && show(before?.[k]) !== show(after?.[k]))
    .map((k) => [k, show(before?.[k]), show(after?.[k])]);
}
