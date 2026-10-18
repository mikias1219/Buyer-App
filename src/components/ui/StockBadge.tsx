import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { StockStatus } from '../../lib/api/types';
import { Badge, type BadgeTone } from './Badge';

const LOOK: Record<StockStatus, { tone: BadgeTone; icon: typeof CheckCircle2 }> = {
  ok: { tone: 'success', icon: CheckCircle2 },
  low: { tone: 'warning', icon: AlertTriangle },
  out: { tone: 'danger', icon: XCircle },
};

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  const { t } = useTranslation();
  const { tone, icon } = LOOK[status];
  return (
    <Badge tone={tone} icon={icon} {...(className ? { className } : {})}>
      {t(`stock.${status}`)}
    </Badge>
  );
}
