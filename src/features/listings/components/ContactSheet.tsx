import { MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Notice } from '../../../components/ui';
import type { ContactResult } from '../../../lib/api/types';
import { haptic, openTelegramLink } from '../../../lib/telegram';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useRequestContact } from '../api';

/** Scam-safety acknowledgement → request_contact RPC → open chat (or show phone). */
export function ContactSheet({ listingId, open, onClose }: { listingId: string; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const [agreed, setAgreed] = useState(false);
  const contact = useRequestContact();
  const [result, setResult] = useState<ContactResult | null>(null);

  const go = () =>
    contact.mutate(listingId, {
      onSuccess: (r) => {
        haptic.notify('success');
        if (r.telegram_url) {
          openTelegramLink(r.telegram_url);
          onClose();
        } else {
          setResult(r);
        }
      },
      onError: () => haptic.notify('error'),
    });

  const tips = ['safetyMeet', 'safetyCheck', 'safetyNoAdvance', 'safetyReport'] as const;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={result ? t('contact.callTitle', { name: result.seller_name }) : t('contact.safetyTitle')}
      footer={
        result?.phone ? (
          <Button block icon={Phone} onClick={() => (window.location.href = `tel:${result.phone}`)}>
            {t('contact.call', { phone: result.phone })}
          </Button>
        ) : result ? null : (
          <Button block icon={MessageCircle} disabled={!agreed} loading={contact.isPending} onClick={go}>
            {t('contact.openChat')}
          </Button>
        )
      }
    >
      {result ? (
        <p className="text-sm text-hint">{result.phone ? t('contact.noUsernameBody') : t('contact.unavailable')}</p>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-2.5">
            {tips.map((k) => (
              <li key={k} className="flex gap-2.5 text-sm">
                <ShieldCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-brand" />
                <span>{t(`contact.${k}`)}</span>
              </li>
            ))}
          </ul>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-input bg-surface-2 px-3.5">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="size-5 accent-[var(--tm-brand)]" />
            <span className="text-sm font-semibold">{t('contact.understand')}</span>
          </label>
          {contact.isError ? (
            <Notice tone="danger" title={t('common.errorTitle')}>
              {errorMessage(contact.error)}
            </Notice>
          ) : null}
        </div>
      )}
    </BottomSheet>
  );
}
