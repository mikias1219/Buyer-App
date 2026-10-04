import { UserRoundCog } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Card, Select } from '../../../components/ui';
import { retrySession } from '../../../features/auth/session';
import { MOCK_USER_KEY } from './constants';

/** Dev/e2e only: switch the mock identity to try every role. */
export default function MockUserSwitcher({ current }: { current: string }) {
  const { t } = useTranslation();
  const users = [
    ['1001', 'Abel — buyer (phone not verified)'],
    ['1002', 'Meron — verified seller'],
    ['1003', 'Kidus — seller without @username'],
    ['9002', 'Eden — moderator'],
    ['9001', 'Dawit — admin'],
  ] as const;
  return (
    <Card className="space-y-2 border border-dashed border-accent">
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <UserRoundCog aria-hidden className="size-4" /> {t('profile.mockActingAs')}
      </p>
      <Select
        value={current}
        options={users.map(([value, label]) => ({ value, label }))}
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
