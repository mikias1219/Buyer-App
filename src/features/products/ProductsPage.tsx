import { Package } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../components/ui';

// Phase 3: list, filters, product form, restock, stock adjustments.
export default function ProductsPage() {
  const { t } = useTranslation();
  return <ComingSoon title={t('nav.products')} icon={Package} />;
}
