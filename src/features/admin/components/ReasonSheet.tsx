import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Chip, Textarea } from '../../../components/ui';

/** Pick a rejection/removal reason code (+ optional note). Reasons are required by the database. */
export function ReasonSheet<R extends string>({
  open,
  title,
  reasons,
  confirmLabel,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  reasons: readonly R[];
  confirmLabel: string;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (reason: R, note: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<R | null>(null);
  const [note, setNote] = useState('');
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <Button block variant="danger" disabled={!reason} loading={loading} onClick={() => reason && onConfirm(reason, note.trim())}>
          {confirmLabel}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('admin.reason')}>
          {reasons.map((r) => (
            <Chip key={r} selected={reason === r} onClick={() => setReason(r)}>
              {t(`rejectReason.${r}`)}
            </Chip>
          ))}
        </div>
        <Textarea label={t('admin.noteToSeller')} optionalLabel={t('common.optional')} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={3} />
      </div>
    </BottomSheet>
  );
}
