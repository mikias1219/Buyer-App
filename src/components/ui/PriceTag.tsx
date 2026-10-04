import { formatEtb } from '../../lib/format';
import { cn } from './cn';

export function PriceTag({ value, size = 'md', className }: { value: number | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <span
      className={cn(
        'tabular font-bold text-ink',
        size === 'sm' && 'text-sm',
        size === 'md' && 'text-base',
        size === 'lg' && 'text-2xl tracking-tight',
        className,
      )}
    >
      {formatEtb(value)}
    </span>
  );
}
