import { ImageOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { imageUrl } from '../../lib/api/client';
import { PriceTag } from './PriceTag';
import { cn } from './cn';

/** Compact row: thumbnail + title + price + arbitrary meta/actions (Mine, admin lists). */
export function ListingRow({
  title,
  price,
  coverPath,
  meta,
  badge,
  children,
  onClick,
  className,
}: {
  title: string;
  price: number | null;
  coverPath: string | null;
  meta?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const src = imageUrl(coverPath, 200);
  const body = (
    <div className="flex gap-3">
      <div className="size-20 shrink-0 overflow-hidden rounded-input bg-surface-2">
        {src ? (
          <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-hint">
            <ImageOff aria-hidden className="size-6" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{title || '—'}</h3>
          {badge}
        </div>
        <PriceTag value={price} size="sm" className="mt-0.5 block" />
        {meta ? <div className="mt-1 text-xs text-hint">{meta}</div> : null}
      </div>
    </div>
  );
  return (
    <div className={cn('rounded-card bg-surface p-3 shadow-card', className)}>
      {onClick ? (
        <button type="button" onClick={onClick} className="block w-full text-left">
          {body}
        </button>
      ) : (
        body
      )}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
