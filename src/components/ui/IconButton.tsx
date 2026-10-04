import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: LucideIcon;
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  variant?: 'plain' | 'surface' | 'overlay' | 'active';
  size?: 'md' | 'sm';
}

const VARIANTS = {
  plain: 'text-ink hover:bg-surface-2',
  surface: 'bg-surface text-ink shadow-card',
  overlay: 'bg-black/45 text-white backdrop-blur-sm',
  active: 'bg-brand-soft text-brand',
};

export function IconButton({ icon: Icon, label, variant = 'plain', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'press inline-flex shrink-0 items-center justify-center rounded-full disabled:opacity-40',
        size === 'md' ? 'size-11' : 'size-9',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      <Icon aria-hidden className={size === 'md' ? 'size-[22px]' : 'size-[18px]'} />
    </button>
  );
}
