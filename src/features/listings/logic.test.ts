import { describe, expect, it } from 'vitest';
import { LISTING_STATUSES } from '../../lib/api/types';
import {
  canEdit,
  canOwnerTransition,
  decideRenewal,
  decideSubmission,
  isValidReference,
  needsReviewAfterEdit,
  normalizeReference,
  ownerActions,
  priceFlag,
  tabForStatus,
} from './logic';

const base = { feeEtb: 100, freeQuota: 2, freeUsed: 0, isFree: false, periodPaid: false, publishedAt: null };

describe('decideSubmission (mirrors submit_listing)', () => {
  it('first listings within quota are free and go to review', () => {
    expect(decideSubmission(base)).toEqual({ status: 'in_review', free: true, consumesQuota: true });
    expect(decideSubmission({ ...base, freeUsed: 1 })).toMatchObject({ free: true });
  });
  it('beyond quota requires the fee', () => {
    expect(decideSubmission({ ...base, freeUsed: 2 })).toEqual({ status: 'pending_payment', free: false, consumesQuota: false });
  });
  it('resubmitting a covered period does not consume quota', () => {
    expect(decideSubmission({ ...base, periodPaid: true, isFree: true, freeUsed: 2 })).toEqual({
      status: 'in_review',
      free: false,
      consumesQuota: false,
    });
  });
  it('a fee of 0 makes everything free without using quota', () => {
    expect(decideSubmission({ ...base, feeEtb: 0, freeUsed: 9 })).toEqual({ status: 'in_review', free: true, consumesQuota: false });
  });
  it('previously published listings never use the free quota again', () => {
    expect(decideSubmission({ ...base, publishedAt: '2026-01-01' })).toMatchObject({ status: 'pending_payment' });
  });
});

describe('decideRenewal (mirrors renew_listing)', () => {
  it('first renewal free, then paid', () => {
    expect(decideRenewal(0, 100)).toMatchObject({ status: 'in_review', free: true });
    expect(decideRenewal(1, 100)).toMatchObject({ status: 'pending_payment', free: false });
    expect(decideRenewal(3, 0)).toMatchObject({ status: 'in_review', free: true });
  });
});

describe('status helpers', () => {
  it('every status maps to a Mine tab', () => {
    for (const s of LISTING_STATUSES) expect(tabForStatus(s)).toBeTruthy();
    expect(tabForStatus('rejected')).toBe('action');
    expect(tabForStatus('pending_payment')).toBe('action');
    expect(tabForStatus('payment_submitted')).toBe('review');
  });
  it('owner transitions match the state machine', () => {
    expect(canOwnerTransition('active', 'paused')).toBe(true);
    expect(canOwnerTransition('paused', 'active')).toBe(true);
    expect(canOwnerTransition('active', 'sold')).toBe(true);
    expect(canOwnerTransition('in_review', 'active')).toBe(false);
    expect(canOwnerTransition('sold', 'active')).toBe(false);
    expect(canOwnerTransition('draft', 'active')).toBe(false);
  });
  it('editability', () => {
    expect(canEdit('in_review')).toBe(false);
    expect(canEdit('payment_submitted')).toBe(false);
    expect(canEdit('sold')).toBe(false);
    expect(canEdit('active')).toBe(true);
  });
  it('owner actions put the primary action first', () => {
    const l = { published_at: null, is_featured: false, open_payment: null };
    expect(ownerActions({ ...l, status: 'draft' })[0]).toBe('continue');
    expect(ownerActions({ ...l, status: 'pending_payment' })[0]).toBe('pay');
    expect(ownerActions({ ...l, status: 'rejected' })).toContain('delete');
    expect(ownerActions({ ...l, status: 'rejected', published_at: '2026-01-01' })).not.toContain('delete');
    expect(ownerActions({ ...l, status: 'active' })).toContain('boost');
    expect(ownerActions({ ...l, status: 'active', is_featured: true })).not.toContain('boost');
    expect(ownerActions({ ...l, status: 'expired' })[0]).toBe('renew');
    expect(ownerActions({ ...l, status: 'in_review' })).toEqual([]);
  });
  it('substantive edits on live listings need review', () => {
    expect(needsReviewAfterEdit('active', ['price'])).toBe(false);
    expect(needsReviewAfterEdit('active', ['price', 'title'])).toBe(true);
    expect(needsReviewAfterEdit('paused', ['images'])).toBe(true);
    expect(needsReviewAfterEdit('draft', ['title'])).toBe(false);
  });
});

describe('price sanity and references', () => {
  it('flags prices far from the median', () => {
    expect(priceFlag(2000, 10000)).toBe('price_low');
    expect(priceFlag(50000, 10000)).toBe('price_high');
    expect(priceFlag(9000, 10000)).toBeNull();
    expect(priceFlag(9000, null)).toBeNull();
  });
  it('normalizes and validates Telebirr references', () => {
    expect(normalizeReference(' ckk 12abc34 ')).toBe('CKK12ABC34');
    expect(isValidReference('ckk12abc34')).toBe(true);
    expect(isValidReference('ab')).toBe(false);
    expect(isValidReference('CKK12ABC34!')).toBe(false);
  });
});
