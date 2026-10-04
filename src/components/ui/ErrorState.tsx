import { AlertTriangle, RotateCw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toAppError } from '../../lib/api/errors';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { Button } from './Button';
import { cn } from './cn';

export function ErrorState({ error, onRetry, className }: { error: unknown; onRetry?: () => void; className?: string }) {
  const { t } = useTranslation();
  const message = useErrorMessage();
  const code = toAppError(error).code;
  const Icon = code === 'network' ? WifiOff : AlertTriangle;
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 py-12 text-center', className)}>
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-danger-soft text-danger">
        <Icon aria-hidden className="size-8" />
      </div>
      <h2 className="text-base font-semibold">{t('common.errorTitle')}</h2>
      <p className="mt-1 max-w-xs text-sm text-hint">{message(error)}</p>
      {onRetry ? (
        <Button variant="secondary" icon={RotateCw} className="mt-5" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
