import type { ProductCondition } from '../types/product';

const STYLES: Record<ProductCondition, string> = {
  New: 'bg-emerald-500 text-white',
  'Like New': 'bg-sky-500 text-white',
  Good: 'bg-amber-500 text-white',
  Fair: 'bg-orange-500 text-white',
};

interface ConditionBadgeProps {
  condition: ProductCondition;
  className?: string;
}

export function ConditionBadge({ condition, className = '' }: ConditionBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm ${STYLES[condition]} ${className}`}
    >
      {condition}
    </span>
  );
}
