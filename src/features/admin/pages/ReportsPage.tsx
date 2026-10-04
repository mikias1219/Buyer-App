import { Ban, Check, Flag, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, ErrorState, ListingRow, ListingRowSkeleton, Tabs, toast } from '../../../components/ui';
import type { AdminReport } from '../../../lib/api/types';
import { formatRelative } from '../../../lib/format';
import { showConfirm } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useMe, usePermissions } from '../../auth/hooks';
import { useAdminReports, useResolveReport } from '../api';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'open' | 'all'>('open');
  const reports = useAdminReports(status);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">{t('admin.reports.title')}</h1>
      <Tabs
        label={t('admin.reports.title')}
        value={status}
        onChange={setStatus}
        items={[
          { value: 'open', label: t('admin.reports.open') },
          { value: 'all', label: t('admin.reports.all') },
        ]}
      />
      {reports.isPending ? (
        <ListingRowSkeleton />
      ) : reports.isError ? (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      ) : reports.data.length === 0 ? (
        <EmptyState icon={Flag} title={t('admin.reports.empty')} />
      ) : (
        <ul className="space-y-2.5">
          {reports.data.map((r) => (
            <li key={r.id}>
              <ReportCard report={r} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ReportCard({ report: r }: { report: AdminReport }) {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const { isAdmin } = usePermissions(me.data);
  const resolve = useResolveReport();
  const errorMessage = useErrorMessage();
  const act = async (action: 'dismiss' | 'remove_listing' | 'ban_user') => {
    if (action !== 'dismiss' && !(await showConfirm(t(`admin.reports.confirm.${action}`)))) return;
    resolve.mutate({ id: r.id, action }, { onSuccess: () => toast.success(t('admin.reports.resolved')), onError: (e) => toast.error(errorMessage(e)) });
  };
  const header = (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <Badge tone="danger">{t(`reportReason.${r.reason}`)}</Badge>
      {r.same_target_open > 1 ? <Badge tone="warning">{t('admin.reports.sameTarget', { count: r.same_target_open })}</Badge> : null}
      {r.status !== 'open' ? <Badge>{t(`admin.reports.status.${r.status}`)}</Badge> : null}
      <span className="text-hint">
        {t('admin.reports.by', { name: r.reporter_name })} · {formatRelative(r.created_at, i18n.language)}
      </span>
    </div>
  );
  const actions =
    r.status === 'open' ? (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={Check} disabled={resolve.isPending} onClick={() => void act('dismiss')}>
          {t('admin.reports.dismiss')}
        </Button>
        {r.target_type === 'product' ? (
          <Button size="sm" variant="danger" icon={Trash2} disabled={resolve.isPending} onClick={() => void act('remove_listing')}>
            {t('admin.reports.removeListing')}
          </Button>
        ) : null}
        {isAdmin && r.user && !r.user.is_banned ? (
          <Button size="sm" variant="danger" icon={Ban} disabled={resolve.isPending} onClick={() => void act('ban_user')}>
            {t('admin.reports.banUser')}
          </Button>
        ) : null}
      </div>
    ) : null;

  return r.product ? (
    <ListingRow title={r.product.title} price={r.product.price} coverPath={r.product.cover_path} meta={<Link to={`/p/${r.product.id}`} className="font-semibold text-brand">{t('admin.viewListing')}</Link>}>
      <div className="space-y-2">
        {header}
        {r.note ? <p className="text-sm">“{r.note}”</p> : null}
        {actions}
      </div>
    </ListingRow>
  ) : (
    <Card className="space-y-2">
      <p className="text-sm font-semibold">
        {r.user?.name} {r.user?.username ? <span className="font-normal text-hint">@{r.user.username}</span> : null}
      </p>
      {header}
      {r.note ? <p className="text-sm">“{r.note}”</p> : null}
      {actions}
    </Card>
  );
}
