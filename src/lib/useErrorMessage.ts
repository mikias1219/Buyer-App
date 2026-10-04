import { useTranslation } from 'react-i18next';
import { isKnownCode, toAppError } from './api/errors';

/** Localized, user-facing message for any thrown error. */
export function useErrorMessage(): (err: unknown) => string {
  const { t } = useTranslation();
  return (err: unknown) => {
    const e = toAppError(err);
    if (e.code === 'listing_incomplete' && e.detail) {
      const fields = e.detail
        .split(',')
        .map((f) => t(`fields.${f}`))
        .join(', ');
      return t('errors.listing_incomplete_fields', { fields });
    }
    if (e.code === 'max_active_listings' && e.detail) return t('errors.max_active_listings_n', { count: Number(e.detail) });
    if (e.code.startsWith('init_data_')) return t('errors.session_expired');
    return isKnownCode(e.code) ? t(`errors.${e.code}`) : t('errors.generic');
  };
}
