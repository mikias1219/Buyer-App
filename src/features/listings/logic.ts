/**
 * Client mirror of the listing rules enforced in SQL (supabase/migrations/0400–0500).
 * The database is authoritative; this decides what the UI offers and powers the mock backend.
 * Keep in sync with supabase/tests/20_listing_lifecycle.sql.
 */
import type { ListingFlag, ListingStatus, PaymentRef } from '../../lib/api/types';

export const MINE_TABS = ['live', 'review', 'action', 'drafts', 'sold', 'expired'] as const;
export type MineTab = (typeof MINE_TABS)[number];

export function tabForStatus(status: ListingStatus): MineTab {
  switch (status) {
    case 'active':
    case 'paused':
      return 'live';
    case 'in_review':
    case 'payment_submitted':
      return 'review';
    case 'pending_payment':
    case 'rejected':
      return 'action';
    case 'draft':
      return 'drafts';
    case 'sold':
      return 'sold';
    case 'expired':
    case 'removed':
      return 'expired';
  }
}

/** Statuses whose content the owner may edit. */
export const EDITABLE_STATUSES: readonly ListingStatus[] = [
  'draft',
  'rejected',
  'pending_payment',
  'active',
  'paused',
  'expired',
];

export function canEdit(status: ListingStatus): boolean {
  return EDITABLE_STATUSES.includes(status);
}

/** Owner status changes allowed by set_listing_status. */
export const OWNER_TRANSITIONS: Partial<Record<ListingStatus, ReadonlyArray<'paused' | 'active' | 'sold'>>> = {
  active: ['paused', 'sold'],
  paused: ['active', 'sold'],
};

export function canOwnerTransition(from: ListingStatus, to: 'paused' | 'active' | 'sold'): boolean {
  return OWNER_TRANSITIONS[from]?.includes(to) ?? false;
}

export type OwnerAction =
  | 'continue'
  | 'edit'
  | 'fix'
  | 'resubmit'
  | 'pay'
  | 'view_payment'
  | 'pause'
  | 'resume'
  | 'mark_sold'
  | 'renew'
  | 'boost'
  | 'delete';

interface ActionInput {
  status: ListingStatus;
  published_at: string | null;
  is_featured: boolean;
  open_payment: PaymentRef | null;
}

/** Primary action first; the UI shows the first one as the main button. */
export function ownerActions(l: ActionInput): OwnerAction[] {
  const neverPublished = l.published_at === null;
  switch (l.status) {
    case 'draft':
      return ['continue', 'delete'];
    case 'rejected':
      return neverPublished ? ['fix', 'resubmit', 'delete'] : ['fix', 'resubmit'];
    case 'pending_payment':
      return neverPublished ? ['pay', 'edit', 'delete'] : ['pay', 'edit'];
    case 'payment_submitted':
      return ['view_payment'];
    case 'active':
      return l.is_featured ? ['mark_sold', 'edit', 'pause'] : ['mark_sold', 'edit', 'boost', 'pause'];
    case 'paused':
      return ['resume', 'edit', 'mark_sold'];
    case 'expired':
      return ['renew', 'edit'];
    case 'in_review':
    case 'sold':
    case 'removed':
      return [];
  }
}

/** Edits to these fields on a live listing send it back to review. */
export const SUBSTANTIVE_FIELDS = ['title', 'description', 'category', 'brand', 'model', 'condition', 'specs', 'images'] as const;

export function needsReviewAfterEdit(status: ListingStatus, changed: readonly string[]): boolean {
  return (status === 'active' || status === 'paused') && changed.some((k) => (SUBSTANTIVE_FIELDS as readonly string[]).includes(k));
}

export interface SubmissionInput {
  feeEtb: number;
  freeQuota: number;
  freeUsed: number;
  isFree: boolean;
  periodPaid: boolean;
  publishedAt: string | null;
}

export interface SubmissionDecision {
  status: 'in_review' | 'pending_payment';
  free: boolean;
  consumesQuota: boolean;
}

/** Mirrors submit_listing: free quota (lifetime), fee 0 ⇒ free, already-covered periods stay covered. */
export function decideSubmission(i: SubmissionInput): SubmissionDecision {
  if (i.periodPaid) return { status: 'in_review', free: false, consumesQuota: false };
  if (i.feeEtb === 0) return { status: 'in_review', free: true, consumesQuota: false };
  if (i.publishedAt === null && !i.isFree && i.freeUsed < i.freeQuota) {
    return { status: 'in_review', free: true, consumesQuota: true };
  }
  return { status: 'pending_payment', free: false, consumesQuota: false };
}

/** Mirrors renew_listing: first renewal free (→ review), later ones pay the listing fee. */
export function decideRenewal(renewCount: number, feeEtb: number): SubmissionDecision {
  const free = renewCount === 0 || feeEtb === 0;
  return { status: free ? 'in_review' : 'pending_payment', free, consumesQuota: false };
}

/** Free listings left, shown before submitting. */
export function freeListingsLeft(quota: number, used: number): number {
  return Math.max(quota - used, 0);
}

/** Price sanity (A3.7): < 25% or > 400% of the median of ≥ 5 comparable live listings. */
export function priceFlag(price: number | null, median: number | null): ListingFlag | null {
  if (price === null || median === null || median <= 0) return null;
  if (price < median * 0.25) return 'price_low';
  if (price > median * 4) return 'price_high';
  return null;
}

export function normalizeReference(ref: string): string {
  return ref.replace(/\s+/g, '').toUpperCase();
}

export function isValidReference(ref: string): boolean {
  return /^[A-Z0-9-]{6,32}$/.test(normalizeReference(ref));
}

export function isLive(status: ListingStatus): boolean {
  return status === 'active';
}
