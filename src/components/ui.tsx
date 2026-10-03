import type { ReactNode } from 'react';

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-0.5">
        <h1 className="text-[24px] font-bold tracking-tight leading-tight">{title}</h1>
        {subtitle ? (
          <p className="text-[13px] leading-snug text-[var(--tg-theme-hint-color,#8e8e93)]">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action}
    </header>
  );
}

export function SectionCard({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={[
        'overflow-hidden rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#ffffff)] shadow-[0_1px_0_rgba(0,0,0,0.04)]',
        padded ? 'p-4' : '',
        className,
      ].join(' ')}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#8e8e93)]">
        {title}
      </h2>
      {action}
    </div>
  );
}

export function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5">
      <dt className="text-[14px] text-[var(--tg-theme-hint-color,#8e8e93)]">{label}</dt>
      <dd
        className={[
          'max-w-[60%] truncate text-right text-[14px] font-medium',
          mono ? 'tabular-nums' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

export function PrimaryButton({
  children,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={[
        'w-full rounded-2xl bg-[var(--tg-theme-button-color,#2481cc)] py-3.5 text-[16px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] transition active:opacity-85 disabled:opacity-55',
        className,
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export const fieldClass =
  'w-full rounded-2xl border-0 bg-[var(--tg-theme-bg-color,#efeff4)] px-3.5 py-3 text-[15px] text-[var(--tg-theme-text-color,#000)] outline-none placeholder:text-[var(--tg-theme-hint-color,#8e8e93)] focus:ring-2 focus:ring-[var(--tg-theme-button-color,#2481cc)]/35';
