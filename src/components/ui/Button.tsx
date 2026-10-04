import type { LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'accent';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  block?: boolean;
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-contrast hover:bg-brand-strong',
  secondary: 'bg-surface-2 text-ink hover:bg-line',
  soft: 'bg-brand-soft text-brand',
  ghost: 'bg-transparent text-brand hover:bg-brand-soft',
  danger: 'bg-danger text-white',
  accent: 'bg-accent text-[#1f1300]',
};

const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5 rounded-[10px]',
  md: 'min-h-11 px-4 text-base gap-2 rounded-input',
  lg: 'min-h-13 px-5 text-base gap-2 rounded-input',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, iconRight: IconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'press inline-flex select-none items-center justify-center font-semibold disabled:opacity-50',
        VARIANTS[variant],
        SIZES[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : Icon ? <Icon aria-hidden className="size-[18px] shrink-0" /> : null}
      {children}
      {IconRight && !loading ? <IconRight aria-hidden className="size-[18px] shrink-0" /> : null}
    </button>
  );
});
