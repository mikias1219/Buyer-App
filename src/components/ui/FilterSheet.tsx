import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/** Filters in a bottom sheet with Reset / Apply. The caller owns the draft state. */
export function FilterSheet({
  open,
  onClose,
  onApply,
  onReset,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  title?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title ?? t('filters.title')}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" icon={RotateCcw} onClick={onReset}>
            {t('filters.reset')}
          </Button>
          <Button
            block
            onClick={() => {
              onApply();
              onClose();
            }}
          >
            {t('filters.apply')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pt-1">{children}</div>
    </BottomSheet>
  );
}

/** Labelled group of chips inside a FilterSheet. */
export function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold">{label}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}
