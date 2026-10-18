import { UserRoundCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Select } from '../../../components/ui';
import { retrySession } from '../../../features/auth/session';
import { MOCK_USER_KEY } from './constants';
import { MOCK_USERS } from './seed';

/** Dev/e2e only: switch the mock identity to try every role. */
export default function MockUserSwitcher() {
  const { t } = useTranslation();
  let current: string = MOCK_USERS.owner;
  try {
    current = window.localStorage.getItem(MOCK_USER_KEY) ?? MOCK_USERS.owner;
  } catch {
    /* storage unavailable */
  }
  const options = [
    { value: MOCK_USERS.owner, label: t('mock.owner') },
    { value: MOCK_USERS.staff, label: t('mock.staff') },
    { value: MOCK_USERS.stranger, label: t('mock.stranger') },
  ];
  return (
    <Card className="space-y-2 border border-dashed border-accent">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <UserRoundCog aria-hidden className="size-4" /> {t('mock.actingAs')}
      </p>
      <Select
        aria-label={t('mock.actingAs')}
        value={current}
        options={options}
        onChange={(e) => {
          try {
            window.localStorage.setItem(MOCK_USER_KEY, e.target.value);
          } catch {
            /* ignore */
          }
          void retrySession().then(() => window.location.reload());
        }}
      />
    </Card>
  );
}
