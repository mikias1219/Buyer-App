import { Link } from 'react-router-dom';
import type { Product } from '../types/product';
import { formatETB, formatRelativeDate } from '../utils/format';
import { ConditionBadge } from './ConditionBadge';

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  return (
    <Link
      to={`/product/${product.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#ffffff)] shadow-[0_1px_0_rgba(0,0,0,0.04)] ring-1 ring-black/[0.04] transition active:scale-[0.98] dark:ring-white/10"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-black/[0.04]">
        <img
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition duration-300 group-active:scale-[1.02]"
        />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/35 to-transparent" />
        <div className="absolute left-2 top-2">
          <ConditionBadge condition={product.condition} />
        </div>
        {product.city ? (
          <span className="absolute bottom-2 left-2 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
            {product.city}
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 px-2.5 pb-2.5 pt-2">
        {product.brand ? (
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-[var(--tg-theme-hint-color,#8e8e93)]">
            {product.brand}
          </p>
        ) : null}
        <h3 className="line-clamp-2 min-h-[2.4em] text-[13px] font-semibold leading-snug text-[var(--tg-theme-text-color,#000)]">
          {product.title}
        </h3>
        <p className="text-[16px] font-bold tabular-nums text-[var(--tg-theme-link-color,#2481cc)]">
          {formatETB(product.price)}
        </p>
        <div className="mt-auto flex items-center justify-between gap-1 pt-1 text-[11px] text-[var(--tg-theme-hint-color,#8e8e93)]">
          <span className="truncate font-medium">{product.category}</span>
          <span className="shrink-0">{formatRelativeDate(product.created_at)}</span>
        </div>
      </div>
    </Link>
  );
}
