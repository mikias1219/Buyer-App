import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from './cn';

/**
 * Two-line list row (products, sales, expenses, team). Renders a link, a button or static
 * content. Use inside ListGroup.
 */
export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  meta,
  to,
  onClick,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right column, top line (e.g. price). */
  trailing?: ReactNode;
  /** Right column, bottom line (e.g. stock badge). */
  meta?: ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
}) {
  const content = (
    <>
      {leading ? <span className="shrink-0">{leading}</span> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-semibold">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-xs text-hint">{subtitle}</span> : null}
      </span>
      {trailing || meta ? (
        <span className="flex shrink-0 flex-col items-end gap-1 text-right">
          {trailing ? <span className="text-sm font-semibold">{trailing}</span> : null}
          {meta}
        </span>
      ) : null}
      {to || onClick ? <ChevronRight aria-hidden className="size-5 shrink-0 text-hint" /> : null}
    </>
  );
  const cls = cn('flex min-h-16 w-full items-center gap-3 px-4 py-2.5', className);
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
