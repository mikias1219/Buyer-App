import { CheckCircle2, MessageCircle, Phone, RotateCw, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { PrimaryAction } from '../../app/telegramHooks';
import { Button, Card, Notice, toast } from '../../components/ui';
import { backendKind } from '../../lib/api/client';
import { haptic, openTelegramLink, requestContact } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useMe, useSettings, useVerifyPhone } from '../auth/hooks';

/** Verify the phone with Telegram's signed requestContact (checked server-side), never a typed number. */
export default function VerifyPhonePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const reason = params.get('reason') === 'contact' ? 'contact' : 'sell';
  const errorMessage = useErrorMessage();
  const me = useMe();
  const settings = useSettings();
  const verify = useVerifyPhone();
  const [unsupported, setUnsupported] = useState(false);

  if (me.data?.phone_verified) return <Navigate to={next} replace />;

  const share = async () => {
    haptic.impact('light');
    if (backendKind() === 'mock') {
      verify.mutate('mock', { onSuccess: () => navigate(next, { replace: true }) });
      return;
    }
    const result = await requestContact();
    if (!result.ok) {
      if (result.reason === 'unsupported') setUnsupported(true);
      else toast.info(t('verify.cancelled'));
      return;
    }
    verify.mutate(result.response, {
      onSuccess: () => {
        haptic.notify('success');
        toast.success(t('verify.success'));
        navigate(next, { replace: true });
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  const bot = settings.data?.bot_username;

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3 pt-4 text-center">
        <span className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand">
          <Phone aria-hidden className="size-8" />
        </span>
        <h1 className="text-xl font-bold">{t('verify.title')}</h1>
        <p className="max-w-xs text-sm text-hint">{t(`verify.why.${reason}`)}</p>
      </div>
      <Card className="space-y-2.5">
        {(['point1', 'point2', 'point3'] as const).map((k) => (
          <p key={k} className="flex gap-2.5 text-sm">
            <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
            {t(`verify.${k}`)}
          </p>
        ))}
      </Card>
      {unsupported ? (
        <Notice tone="warning" icon={MessageCircle} title={t('verify.unsupportedTitle')}>
          <p>{t('verify.unsupportedBody')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {bot ? (
              <Button size="sm" icon={MessageCircle} onClick={() => openTelegramLink(`https://t.me/${bot}`)}>
                {t('verify.openBot')}
              </Button>
            ) : null}
            <Button size="sm" variant="secondary" icon={RotateCw} onClick={() => void me.refetch()}>
              {t('verify.checkAgain')}
            </Button>
          </div>
        </Notice>
      ) : null}
      {verify.isSuccess ? (
        <Notice tone="success" icon={CheckCircle2}>
          {t('verify.success')}
        </Notice>
      ) : null}
      <PrimaryAction text={t('verify.share')} onClick={() => void share()} loading={verify.isPending} />
    </div>
  );
}

/** Only allow in-app redirects (no open redirects via ?next=). */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/';
}
