import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../components/ui';
import { usePermissions } from '../auth/hooks';

// Phase 4: sales history with filters, void and returns.
export default function SalesPage() {
  const { t } = useTranslation();
  const { isOwner } = usePermissions();
  return <ComingSoon title={isOwner ? t('nav.sales') : t('nav.mySales')} icon={Receipt} />;
}
