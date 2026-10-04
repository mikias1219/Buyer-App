/**
 * Every failure surfaced to the UI is an AppError with a stable `code`.
 * Codes come from the database (`app_error('code')`), Edge Functions (`{ error: 'code' }`) or the
 * transport itself. The UI translates them via i18n key `errors.<code>`.
 */
export class AppError extends Error {
  readonly code: string;
  readonly detail: string;
  readonly status: number;

  constructor(code: string, detail = '', status = 0) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

/** Codes the backend may raise; anything else is reported as `generic`. */
export const KNOWN_ERROR_CODES = [
  'not_authenticated',
  'not_authorized',
  'banned',
  'not_found',
  'invalid_input',
  'illegal_transition',
  'listing_incomplete',
  'listing_locked',
  'listing_not_active',
  'listing_expired',
  'phone_not_verified',
  'banned_words',
  'max_active_listings',
  'rate_limited',
  'duplicate_reference',
  'invalid_reference_format',
  'payment_already_submitted',
  'payment_required',
  'reason_required',
  'own_listing',
  'not_reviewable',
  'already_reviewed',
  'boost_unavailable',
  'cannot_target_self',
  'cannot_ban_admin',
  'user_banned',
  'session_expired',
  'network',
  'not_configured',
  'contact_not_yours',
  'invalid_contact',
  'unsupported',
  'upload_failed',
  'generic',
] as const;

export type KnownErrorCode = (typeof KNOWN_ERROR_CODES)[number];

export function isKnownCode(code: string): code is KnownErrorCode {
  return (KNOWN_ERROR_CODES as readonly string[]).includes(code);
}

/** Normalize anything thrown (PostgREST errors, fetch failures, …) into an AppError. */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err && typeof err === 'object') {
    const e = err as { message?: unknown; code?: unknown; details?: unknown; status?: unknown };
    const message = typeof e.message === 'string' ? e.message : '';
    const code = typeof e.code === 'string' ? e.code : '';
    const detail = typeof e.details === 'string' ? e.details : '';
    if (/^[a-z_]+$/.test(message) && message.length <= 40) return new AppError(message, detail);
    if (code === '42501') return new AppError('not_authorized', message);
    if (code === 'PGRST301' || /jwt expired/i.test(message)) return new AppError('session_expired', message);
    if (err instanceof TypeError || /failed to fetch|network/i.test(message)) return new AppError('network', message);
    return new AppError('generic', message || code);
  }
  return new AppError('generic', String(err));
}

/** Parse "a,b,c" detail of listing_incomplete into field names. */
export function missingFields(error: AppError): string[] {
  return error.code === 'listing_incomplete' && error.detail ? error.detail.split(',').filter(Boolean) : [];
}
