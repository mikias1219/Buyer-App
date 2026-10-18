import { useTranslation } from 'react-i18next';
import { isKnownCode, toAppError } from './api/errors';

/** Localized, user-facing message for any thrown error. */
export function useErrorMessage(): (err: unknown) => string {
  const { t } = useTranslation();
  return (err: unknown) => {
    const e = toAppError(err);
    if (e.code.startsWith('init_data_')) return t('errors.session_expired');
    return isKnownCode(e.code) ? t(`errors.${e.code}`) : t('errors.generic');
  };
}
