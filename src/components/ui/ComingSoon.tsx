import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from './EmptyState';
import { PageHeader } from './Layout';

/** Placeholder for a screen that arrives in a later phase (no fake data). */
export function ComingSoon({ title, icon }: { title: string; icon: LucideIcon }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <PageHeader title={title} />
      <EmptyState icon={icon} title={t('comingSoon.title')} description={t('comingSoon.body')} />
    </div>
  );
}
