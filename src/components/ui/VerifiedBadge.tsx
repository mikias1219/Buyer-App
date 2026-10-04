import { BadgeCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

export function VerifiedBadge({ className, withLabel }: { className?: string; withLabel?: boolean }) {
  const { t } = useTranslation();
  return (
    <span className={cn('inline-flex items-center gap-1 text-brand', className)} title={t('seller.verified')}>
      <BadgeCheck aria-label={withLabel ? undefined : t('seller.verified')} aria-hidden={withLabel || undefined} className="size-4 shrink-0" />
      {withLabel ? <span className="text-xs font-semibold">{t('seller.verified')}</span> : null}
    </span>
  );
}
