import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn('rounded-card bg-surface shadow-card', padded && 'p-4', className)} {...rest} />;
}
