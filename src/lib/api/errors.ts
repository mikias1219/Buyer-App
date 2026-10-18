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

/** Codes the backend may raise (docs/BACKEND.md §7) plus transport codes; anything else is `generic`. */
export const KNOWN_ERROR_CODES = [
  'not_authenticated',
  'banned',
  'no_access',
  'not_authorized',
  'not_found',
  'invalid_input',
  'invalid_quantity',
  'insufficient_stock',
  'product_unavailable',
  'below_cost',
  'customer_required',
  'duplicate_sku',
  'duplicate_barcode',
  'duplicate_category',
  'has_history',
  'no_change',
  'invalid_transition',
  'return_exceeds_sold',
  'last_owner',
  'conflict',
  'duplicate_phone',
  'exceeds_balance',
  'rate_limited',
  'session_expired',
  'network',
  'not_configured',
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
