import type { LucideIcon } from 'lucide-react';
import { CreditCard, Eye, Pause, PencilLine, Play, RefreshCw, Rocket, Send, Tag, Trash2, Wrench } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from '../../components/ui';
import type { PaymentRef, SubmitResult } from '../../lib/api/types';
import { haptic, showConfirm } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useCreateBoost, useDeleteListing, useRenewListing, useSetListingStatus, useSubmitListing } from '../sell/api';
import type { OwnerAction } from './logic';

export const ACTION_ICONS: Record<OwnerAction, LucideIcon> = {
  continue: PencilLine,
  edit: PencilLine,
  fix: Wrench,
  resubmit: Send,
  pay: CreditCard,
  view_payment: Eye,
  pause: Pause,
  resume: Play,
  mark_sold: Tag,
  renew: RefreshCw,
  boost: Rocket,
  delete: Trash2,
};

/** One place for every owner action so Mine, the listing page and edit behave identically. */
export function useOwnerActions() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const setStatus = useSetListingStatus();
  const renew = useRenewListing();
  const remove = useDeleteListing();
  const boost = useCreateBoost();
  const submit = useSubmitListing();
  const busy = setStatus.isPending || renew.isPending || remove.isPending || boost.isPending || submit.isPending;

  const fail = (e: unknown) => toast.error(errorMessage(e));
  const afterSubmit = (id: string, r: SubmitResult) => {
    if (r.payment_id) navigate(`/pay/${r.payment_id}`);
    else navigate(`/sell/done/${id}`);
  };

  const run = async (action: OwnerAction, l: { id: string; open_payment: PaymentRef | null }) => {
    switch (action) {
      case 'continue':
        navigate(`/sell/${l.id}`);
        return;
      case 'edit':
      case 'fix':
        navigate(`/mine/${l.id}/edit`);
        return;
      case 'pay':
      case 'view_payment':
        if (l.open_payment) navigate(`/pay/${l.open_payment.id}`);
        return;
      case 'resubmit':
        submit.mutate(l.id, { onSuccess: (r) => afterSubmit(l.id, r), onError: fail });
        return;
      case 'pause':
        setStatus.mutate({ id: l.id, status: 'paused' }, { onSuccess: () => toast.success(t('owner.paused')), onError: fail });
        return;
      case 'resume':
        setStatus.mutate(
          { id: l.id, status: 'active' },
          {
            onSuccess: (s) => (s === 'expired' ? toast.info(t('owner.expiredOnResume')) : toast.success(t('owner.resumed'))),
            onError: fail,
          },
        );
        return;
      case 'mark_sold':
        if (!(await showConfirm(t('owner.confirmSold')))) return;
        haptic.impact('medium');
        setStatus.mutate({ id: l.id, status: 'sold' }, { onSuccess: () => toast.success(t('owner.sold')), onError: fail });
        return;
      case 'renew':
        renew.mutate(l.id, { onSuccess: (r) => afterSubmit(l.id, r), onError: fail });
        return;
      case 'boost':
        boost.mutate(l.id, { onSuccess: (r) => navigate(`/pay/${r.payment_id}`), onError: fail });
        return;
      case 'delete':
        if (!(await showConfirm(t('owner.confirmDelete')))) return;
        remove.mutate(l.id, { onSuccess: () => toast.success(t('owner.deleted')), onError: fail });
        return;
    }
  };

  return { run: (a: OwnerAction, l: { id: string; open_payment: PaymentRef | null }) => void run(a, l), busy };
}
