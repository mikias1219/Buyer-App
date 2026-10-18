import { Package } from 'lucide-react';
import { imageUrl } from '../../../lib/api/client';
import { cn } from '../../../components/ui';

export function ProductThumb({ path, size = 44, className }: { path: string | null | undefined; size?: number; className?: string }) {
  const url = imageUrl(path, size * 2);
  return url ? (
    <img src={url} alt="" width={size} height={size} loading="lazy" className={cn('shrink-0 rounded-[10px] object-cover', className)} style={{ width: size, height: size }} />
  ) : (
    <span aria-hidden className={cn('flex shrink-0 items-center justify-center rounded-[10px] bg-brand-soft text-brand', className)} style={{ width: size, height: size }}>
      <Package className="size-5" />
    </span>
  );
}
