import { ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ComingSoon } from '../../components/ui';

// Phase 4: point of sale (cart, discounts, payment method, receipt).
export default function SellPage() {
  const { t } = useTranslation();
  return <ComingSoon title={t('nav.sell')} icon={ShoppingCart} />;
}
