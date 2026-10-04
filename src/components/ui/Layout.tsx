import type { LucideIcon } from 'lucide-react';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './cn';

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-start justify-between gap-3 pb-1">
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight tracking-tight">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-hint">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Section({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2.5', className)}>
      {title ? (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <h2 className="text-base font-bold">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Row in a grouped list (settings, profile, admin). Renders a link, a button, or static content. */
export function ListItem({
  icon: Icon,
  label,
  value,
  to,
  onClick,
  tone,
  trailing,
}: {
  icon?: LucideIcon;
  label: string;
  value?: ReactNode;
  to?: string;
  onClick?: () => void;
  tone?: 'danger' | 'brand';
  trailing?: ReactNode;
}) {
  const content = (
    <>
      {Icon ? (
        <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-[10px]', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
          <Icon aria-hidden className="size-5" />
        </span>
      ) : null}
      <span className={cn('min-w-0 flex-1 text-left text-sm font-medium', tone === 'danger' && 'text-danger')}>{label}</span>
      {value !== undefined ? <span className="max-w-[50%] truncate text-right text-sm text-hint">{value}</span> : null}
      {trailing}
      {to || onClick ? <ChevronRight aria-hidden className="size-5 shrink-0 text-hint" /> : null}
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 px-4 py-2';
  if (to) {
    return (
      <Link to={to} className={cn(cls, 'press')}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(cls, 'press')}>
        {content}
      </button>
    );
  }
  return <div className={cls}>{content}</div>;
}

export function ListGroup({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('divide-y divide-line overflow-hidden rounded-card bg-surface shadow-card', className)}>{children}</div>;
}

export function Notice({
  tone = 'brand',
  icon: Icon,
  title,
  children,
  action,
}: {
  tone?: 'brand' | 'warning' | 'danger' | 'success';
  icon?: LucideIcon;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const tones = {
    brand: 'bg-brand-soft text-brand',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger',
    success: 'bg-success-soft text-success',
  };
  return (
    <div className={cn('rounded-card p-3.5', tones[tone])} role={tone === 'danger' ? 'alert' : undefined}>
      <div className="flex gap-2.5">
        {Icon ? <Icon aria-hidden className="mt-0.5 size-5 shrink-0" /> : null}
        <div className="min-w-0 flex-1">
          {title ? <p className="text-sm font-semibold">{title}</p> : null}
          {children ? <div className="mt-0.5 text-sm text-ink/80">{children}</div> : null}
          {action ? <div className="mt-2.5">{action}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'danger' | 'warning' | 'success' }) {
  return (
    <div className="rounded-card bg-surface p-3.5 shadow-card">
      <p className="text-xs font-medium text-hint">{label}</p>
      <p
        className={cn(
          'tabular mt-1 text-xl font-bold',
          tone === 'danger' && 'text-danger',
          tone === 'warning' && 'text-warning',
          tone === 'success' && 'text-success',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-xs text-hint">{hint}</p> : null}
    </div>
  );
}
