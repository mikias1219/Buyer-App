import { Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '../../../components/ui';
import { minutesSince } from '../../../lib/format';

/** Waiting time with SLA colours: > 1h amber, > 4h red (SPEC A5 flow 7). */
export function SlaBadge({ since }: { since: string | null | undefined }) {
  const { t } = useTranslation();
  if (!since) return null;
  const m = minutesSince(since);
  const tone = m > 240 ? 'danger' : m > 60 ? 'warning' : 'neutral';
  const label = m < 60 ? t('admin.minutes', { count: m }) : m < 2880 ? t('admin.hours', { count: Math.floor(m / 60) }) : t('admin.days', { count: Math.floor(m / 1440) });
  return (
    <Badge tone={tone} icon={Clock}>
      {label}
    </Badge>
  );
}
