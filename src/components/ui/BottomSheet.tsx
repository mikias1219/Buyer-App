import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import { cn } from './cn';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'auto' | 'tall';
}

/** Modal bottom sheet: focus moves in, Escape/backdrop closes, focus returns to the opener. */
export function BottomSheet({ open, onClose, title, description, children, footer, size = 'auto' }: BottomSheetProps) {
  const { t } = useTranslation();
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = panel.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-sheet-close])');
    (first ?? panel.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const focusable = panel.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        const list = Array.from(focusable).filter((el) => !el.hasAttribute('disabled'));
        const firstEl = list[0];
        const lastEl = list[list.length - 1];
        if (!firstEl || !lastEl) return;
        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      opener?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button
        type="button"
        aria-label={t('common.close')}
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-black/45 [animation:tm-fade-in_150ms_ease]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          'relative flex w-full max-w-lg flex-col rounded-t-sheet bg-surface shadow-sheet outline-none [animation:tm-sheet-in_220ms_cubic-bezier(.2,.8,.2,1)]',
          size === 'tall' ? 'h-[88vh]' : 'max-h-[88vh]',
        )}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" aria-hidden />
        <div className="flex items-start gap-2 px-4 pb-2 pt-2">
          <div className="min-w-0 flex-1 pt-2">
            <h2 id={titleId} className="text-lg font-bold leading-tight">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-hint">{description}</p> : null}
          </div>
          <IconButton icon={X} label={t('common.close')} onClick={onClose} data-sheet-close size="sm" className="mt-1" />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? (
          <div className="border-t border-line px-4 pt-3" style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}>
            {footer}
          </div>
        ) : (
          <div style={{ height: 'var(--safe-bottom)' }} />
        )}
      </div>
    </div>,
    document.body,
  );
}
