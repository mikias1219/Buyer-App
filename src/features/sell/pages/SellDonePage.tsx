import { CheckCircle2, Clock, Home, Store } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Card } from '../../../components/ui';

export default function SellDonePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-success-soft text-success">
        <CheckCircle2 aria-hidden className="size-11" />
      </span>
      <div>
        <h1 className="text-xl font-bold">{t('sell.done.title')}</h1>
        <p className="mt-1 text-sm text-hint">{t('sell.done.body')}</p>
      </div>
      <Card className="flex w-full items-center gap-3 text-left">
        <Clock aria-hidden className="size-6 shrink-0 text-brand" />
        <p className="text-sm">{t('sell.done.eta')}</p>
      </Card>
      <div className="grid w-full gap-2">
        <Button block icon={Store} onClick={() => navigate(id ? `/p/${id}` : '/mine', { replace: true })}>
          {t('sell.done.view')}
        </Button>
        <Button block variant="secondary" icon={Home} onClick={() => navigate('/', { replace: true })}>
          {t('sell.done.home')}
        </Button>
      </div>
    </div>
  );
}
