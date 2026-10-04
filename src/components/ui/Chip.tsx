import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  icon?: LucideIcon;
  onRemove?: () => void;
  removeLabel?: string;
}

export function Chip({ selected, icon: Icon, onRemove, removeLabel, className, children, type = 'button', ...rest }: ChipProps) {
  if (onRemove) {
    return (
      <span className={cn('inline-flex min-h-9 items-center gap-1 rounded-full bg-brand-soft pl-3 text-sm font-medium text-brand', className)}>
        {children}
        <button type="button" onClick={onRemove} aria-label={removeLabel} className="press inline-flex size-9 items-center justify-center rounded-full">
          <X aria-hidden className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={cn(
        'press inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium',
        selected ? 'border-brand bg-brand text-brand-contrast' : 'border-line bg-surface text-ink',
        className,
      )}
      {...rest}
    >
      {Icon ? <Icon aria-hidden className="size-4" /> : null}
      {children}
    </button>
  );
}
