import { FileSpreadsheet, HandCoins, Languages, Settings, Upload, UsersRound, Wallet } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Card, Chip, ListGroup, ListItem, PageHeader, Section } from '../../components/ui';
import { LANGUAGES } from '../../lib/i18n';
import { useChangeLanguage, useMe, usePermissions } from '../auth/hooks';
import { useSession } from '../auth/session';

const MockUserSwitcher =
  import.meta.env.DEV || import.meta.env.MODE === 'e2e' ? lazy(() => import('../../lib/api/mock/MockUserSwitcher')) : null;

export default function MorePage() {
  const { t, i18n } = useTranslation();
  const me = useMe().data;
  const { isOwner } = usePermissions();
  const session = useSession();
  const changeLanguage = useChangeLanguage();
  if (!me) return null;
  const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || me.username;

  return (
    <div className="space-y-5">
      <PageHeader title={t('nav.more')} subtitle={me.settings.shop_name || undefined} />
      <Card className="flex items-center gap-3">
        <Avatar name={name} url={me.photo_url} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{name}</p>
          {me.username ? <p className="truncate text-sm text-hint">@{me.username}</p> : null}
        </div>
        <Badge tone={isOwner ? 'brand' : 'neutral'}>{t(`role.${me.role}`)}</Badge>
      </Card>

      {isOwner ? (
        <>
          <Section title={t('more.money')}>
            <ListGroup>
              <ListItem icon={Wallet} label={t('expenses.title')} to="/more/expenses" />
              <ListItem icon={HandCoins} label={t('customers.title')} to="/more/customers" />
              <ListItem icon={FileSpreadsheet} label={t('reports.title')} to="/more/reports" />
            </ListGroup>
          </Section>
          <Section title={t('more.manage')}>
            <ListGroup>
              <ListItem icon={Upload} label={t('import.title')} to="/more/import" />
              <ListItem icon={UsersRound} label={t('team.title')} to="/more/team" />
              <ListItem icon={Settings} label={t('settings.title')} to="/more/settings" />
            </ListGroup>
          </Section>
        </>
      ) : null}

      <Section title={t('more.language')}>
        <Card className="flex items-center gap-3">
          <Languages aria-hidden className="size-5 text-hint" />
          <div role="radiogroup" aria-label={t('more.language')} className="flex gap-2">
            {LANGUAGES.map((lang) => (
              <Chip key={lang} role="radio" aria-checked={i18n.language === lang} selected={i18n.language === lang} onClick={() => changeLanguage(lang)}>
                {t(`language.${lang}`)}
              </Chip>
            ))}
          </div>
        </Card>
      </Section>

      {session.mock && MockUserSwitcher ? (
        <Suspense fallback={null}>
          <MockUserSwitcher />
        </Suspense>
      ) : null}
    </div>
  );
}
