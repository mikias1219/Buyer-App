import { AlertTriangle, ClipboardCheck, CreditCard, Flag, MailWarning } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Card, ErrorState, PageHeader, Section, Skeleton, Stat } from '../../../components/ui';
import { formatEtb, minutesSince } from '../../../lib/format';
import { useAdminDashboard } from '../api';
import { SlaBadge } from '../components/SlaBadge';

export default function DashboardPage() {
  const { t } = useTranslation();
  const dash = useAdminDashboard();
  if (dash.isPending) {
    return (
      <div className="grid grid-cols-2 gap-2" role="status" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    );
  }
  if (dash.isError) return <ErrorState error={dash.error} onRetry={() => void dash.refetch()} />;
  const d = dash.data;
  const paymentWait = minutesSince(d.oldest_payment_at);
  const reviewWait = minutesSince(d.oldest_in_review_at);
  const tone = (m: number) => (m > 240 ? 'danger' : m > 60 ? 'warning' : undefined);

  return (
    <div className="space-y-5">
      <PageHeader title={t('admin.dashboard.title')} subtitle={t(`role.${d.role}`)} />

      <Section title={t('admin.dashboard.todo')}>
        <div className="grid gap-2">
          <TodoLink to="/admin/queue" icon={ClipboardCheck} label={t('admin.dashboard.toReview', { count: d.in_review })} since={d.oldest_in_review_at} empty={d.in_review === 0} />
          {d.payments_waiting !== undefined ? (
            <TodoLink to="/admin/payments" icon={CreditCard} label={t('admin.dashboard.toConfirm', { count: d.payments_waiting })} since={d.oldest_payment_at} empty={d.payments_waiting === 0} />
          ) : null}
          <TodoLink to="/admin/reports" icon={Flag} label={t('admin.dashboard.reports', { count: d.open_reports })} empty={d.open_reports === 0} />
          {d.outbox_failed ? (
            <Card className="flex items-center gap-3 bg-warning-soft">
              <MailWarning aria-hidden className="size-5 text-warning" />
              <p className="text-sm">{t('admin.dashboard.outboxFailed', { count: d.outbox_failed })}</p>
            </Card>
          ) : null}
        </div>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Stat label={t('admin.dashboard.live')} value={d.live_listings} />
        <Stat label={t('admin.dashboard.newToday')} value={d.new_listings_today} />
        <Stat label={t('admin.dashboard.reviewWait')} value={d.in_review ? t('admin.minutes', { count: reviewWait }) : '—'} {...(tone(reviewWait) ? { tone: tone(reviewWait) } : {})} />
        {d.payments_waiting !== undefined ? (
          <Stat label={t('admin.dashboard.paymentWait')} value={d.payments_waiting ? t('admin.minutes', { count: paymentWait }) : '—'} {...(tone(paymentWait) ? { tone: tone(paymentWait) } : {})} />
        ) : null}
        {d.revenue_7d !== undefined ? <Stat label={t('admin.dashboard.revenue7')} value={formatEtb(d.revenue_7d)} tone="success" /> : null}
        {d.revenue_30d !== undefined ? <Stat label={t('admin.dashboard.revenue30')} value={formatEtb(d.revenue_30d)} /> : null}
        {d.users_total !== undefined ? <Stat label={t('admin.dashboard.users')} value={d.users_total} hint={t('admin.dashboard.usersToday', { count: d.users_today ?? 0 })} /> : null}
      </div>

      {d.revenue_by_day?.length ? (
        <Section title={t('admin.dashboard.revenueChart')}>
          <Card>
            <RevenueChart data={d.revenue_by_day} />
          </Card>
        </Section>
      ) : null}

      {d.funnel_30d ? (
        <Section title={t('admin.dashboard.funnel')}>
          <Card className="space-y-2.5">
            {(['created', 'submitted', 'paid', 'live'] as const).map((k) => {
              const v = d.funnel_30d?.[k] ?? 0;
              const max = Math.max(d.funnel_30d?.created ?? 1, 1);
              return (
                <div key={k}>
                  <div className="flex justify-between text-xs">
                    <span>{t(`admin.dashboard.funnelStep.${k}`)}</span>
                    <span className="tabular font-semibold">{v}</span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-brand" style={{ width: `${(v / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </Card>
        </Section>
      ) : null}

      {d.top_categories?.length ? (
        <Section title={t('admin.dashboard.topCategories')}>
          <Card className="divide-y divide-line p-0">
            {d.top_categories.map((c) => (
              <div key={c.category} className="flex justify-between px-4 py-2.5 text-sm">
                <span>{t(`category.${c.category}`)}</span>
                <span className="tabular font-semibold">{c.count}</span>
              </div>
            ))}
          </Card>
        </Section>
      ) : null}
    </div>
  );
}

function TodoLink({ to, icon: Icon, label, since, empty }: { to: string; icon: typeof Flag; label: string; since?: string | null | undefined; empty: boolean }) {
  return (
    <Link to={to} className="press flex min-h-14 items-center gap-3 rounded-card bg-surface px-4 shadow-card">
      <Icon aria-hidden className={empty ? 'size-5 text-hint' : 'size-5 text-brand'} />
      <span className={empty ? 'flex-1 text-sm text-hint' : 'flex-1 text-sm font-semibold'}>{label}</span>
      {!empty && since ? <SlaBadge since={since} /> : null}
      {!empty && !since ? <AlertTriangle aria-hidden className="size-4 text-warning" /> : null}
    </Link>
  );
}

/** Lightweight SVG bar chart (no chart library). */
function RevenueChart({ data }: { data: Array<{ day: string; amount: number }> }) {
  const { t } = useTranslation();
  const max = Math.max(...data.map((d) => d.amount), 1);
  const total = data.reduce((s, d) => s + d.amount, 0);
  const w = 100 / data.length;
  return (
    <figure>
      <svg viewBox="0 0 100 40" role="img" aria-label={t('admin.dashboard.revenueChartAria', { total: formatEtb(total) })} className="h-28 w-full" preserveAspectRatio="none">
        {data.map((d, i) => {
          const h = (d.amount / max) * 36;
          return (
            <rect key={d.day} x={i * w + w * 0.15} y={40 - h} width={w * 0.7} height={Math.max(h, 0.6)} rx={0.8} className={d.amount ? 'fill-brand' : 'fill-line'}>
              <title>{`${d.day}: ${formatEtb(d.amount)}`}</title>
            </rect>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex justify-between text-[11px] text-hint">
        <span>{data[0]?.day.slice(5)}</span>
        <span className="tabular font-semibold text-ink">{formatEtb(total)}</span>
        <span>{data[data.length - 1]?.day.slice(5)}</span>
      </figcaption>
    </figure>
  );
}
