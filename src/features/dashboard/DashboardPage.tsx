import { LayoutDashboard } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../components/ui';

// Phase 5: KPIs, trends, best/slow sellers, stock valuation.
export default function DashboardPage() {
  const { t } = useTranslation();
  return <ComingSoon title={t('nav.dashboard')} icon={LayoutDashboard} />;
}
