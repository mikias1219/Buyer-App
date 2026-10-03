import { Link, useParams } from 'react-router-dom';
import { ConditionBadge } from '../components/ConditionBadge';
import { ProductStatusChip } from '../components/StatusChip';
import { PageHeader, PrimaryButton, SectionCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import { useTelegramContext } from '../context/TelegramContext';
import { formatETB, formatRelativeDate } from '../utils/format';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { getProductById } = useProducts();
  const { tg } = useTelegramContext();
  const { telegramId, isAdmin } = useAuth();
  const product = id ? getProductById(id) : undefined;

  if (!product) {
    return (
      <SectionCard className="py-10 text-center">
        <p className="text-[16px] font-semibold">Listing not found</p>
        <Link
          to="/"
          className="mt-3 inline-block text-[14px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
        >
          Back to browse
        </Link>
      </SectionCard>
    );
  }

  const isOwner = product.seller_id === telegramId;
  const isLive = product.status === 'active';
  // Contact is ONLY for live listings (seller paid + admin confirmed)
  const canSeeContact = isLive || isOwner || isAdmin;
  const telegramUrl =
    canSeeContact && product.seller_username
      ? `https://t.me/${product.seller_username}`
      : null;

  function contactSeller() {
    if (!telegramUrl) return;
    try {
      if (tg?.openTelegramLink) {
        tg.openTelegramLink(telegramUrl);
        return;
      }
      if (tg?.openLink) {
        tg.openLink(telegramUrl);
        return;
      }
    } catch {
      // fall through
    }
    window.open(telegramUrl, '_blank', 'noopener,noreferrer');
  }

  const meta = [
    product.category,
    product.brand || null,
    product.city || null,
    formatRelativeDate(product.created_at),
  ].filter(Boolean);

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Listing"
        subtitle={isLive ? 'Live on marketplace' : 'Not public yet'}
        action={
          <Link
            to="/"
            className="rounded-xl bg-[var(--tg-theme-secondary-bg-color,#fff)] px-3 py-2 text-[13px] font-semibold text-[var(--tg-theme-link-color,#2481cc)] ring-1 ring-black/[0.04]"
          >
            Browse
          </Link>
        }
      />

      {!isLive && (
        <SectionCard className="!bg-amber-500/12 !py-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-100">
                Seller contact is locked
              </p>
              <p className="mt-1 text-[12px] leading-snug text-amber-900/80 dark:text-amber-100/80">
                Buyers can only see Telegram contact after the listing fee is paid and
                confirmed. This protects sellers and keeps the marketplace clean.
              </p>
            </div>
            <ProductStatusChip status={product.status} />
          </div>
          {isOwner && (
            <Link
              to={`/pay/${product.id}`}
              className="mt-3 inline-flex rounded-xl bg-amber-600 px-3 py-2 text-[13px] font-semibold text-white"
            >
              Pay listing fee to unlock →
            </Link>
          )}
        </SectionCard>
      )}

      <SectionCard padded={false}>
        <div className="relative">
          <img
            src={product.image_url}
            alt={product.title}
            className="aspect-[4/3] w-full object-cover bg-black/[0.04]"
          />
          <div className="absolute left-3 top-3 flex gap-1.5">
            <ConditionBadge condition={product.condition} />
            {!isLive && <ProductStatusChip status={product.status} />}
          </div>
        </div>

        <div className="space-y-4 p-4">
          <div>
            {product.brand ? (
              <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#8e8e93)]">
                {product.brand}
              </p>
            ) : null}
            <h2 className="mt-0.5 text-[22px] font-bold leading-tight">{product.title}</h2>
            <p className="mt-2 text-[26px] font-bold tabular-nums text-[var(--tg-theme-link-color,#2481cc)]">
              {formatETB(product.price)}
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {meta.map((item) => (
              <span
                key={String(item)}
                className="rounded-lg bg-[var(--tg-theme-bg-color,#efeff4)] px-2.5 py-1 text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]"
              >
                {item}
              </span>
            ))}
          </div>

          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#8e8e93)]">
              Description
            </p>
            <p className="mt-1.5 whitespace-pre-wrap text-[15px] leading-relaxed">
              {product.description}
            </p>
          </div>

          {canSeeContact && isLive ? (
            <div className="rounded-2xl bg-[var(--tg-theme-bg-color,#efeff4)] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--tg-theme-hint-color,#8e8e93)]">
                Seller contact
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--tg-theme-button-color,#2481cc)] text-[15px] font-bold text-white">
                  {(product.seller_username?.[0] || 'S').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-[16px] font-semibold">
                    {product.seller_username
                      ? `@${product.seller_username}`
                      : `Seller ${product.seller_id}`}
                  </p>
                  <p className="text-[12px] text-emerald-700 dark:text-emerald-300">
                    Listing fee paid · Safe to contact
                  </p>
                </div>
              </div>
              <PrimaryButton
                type="button"
                className="mt-3"
                onClick={contactSeller}
                disabled={!telegramUrl}
              >
                Contact Seller via Telegram
              </PrimaryButton>
            </div>
          ) : canSeeContact && !isLive ? (
            <div className="rounded-2xl border border-dashed border-black/15 bg-[var(--tg-theme-bg-color,#efeff4)] p-3.5 dark:border-white/15">
              <p className="text-[13px] font-semibold">Your contact is hidden from buyers</p>
              <p className="mt-1 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                Preview for you{isAdmin && !isOwner ? ' (admin)' : ''}: @
                {product.seller_username || product.seller_id}
              </p>
              {isOwner && (
                <Link
                  to={`/pay/${product.id}`}
                  className="mt-3 block text-center text-[14px] font-semibold text-[var(--tg-theme-link-color,#2481cc)]"
                >
                  Complete payment to publish →
                </Link>
              )}
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--tg-theme-bg-color,#efeff4)] p-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/10 text-[13px] font-bold text-[var(--tg-theme-hint-color,#8e8e93)] dark:bg-white/10">
                LOCK
              </div>
              <p className="mt-2 text-[15px] font-semibold">Contact locked</p>
              <p className="mt-1 text-[12px] text-[var(--tg-theme-hint-color,#8e8e93)]">
                Seller Telegram is shown only on paid, live listings.
              </p>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
