import { Loader2 } from 'lucide-react';
import { cn } from './cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return <Loader2 aria-label={label} role={label ? 'status' : undefined} aria-hidden={label ? undefined : true} className={cn('size-5 animate-spin', className)} />;
}
