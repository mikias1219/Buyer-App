import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { BottomSheet, Button, Chip, Textarea, toast } from '../../../components/ui';
import { REPORT_REASONS } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useSubmitReport } from '../api';

const schema = z.object({ reason: z.enum(REPORT_REASONS), note: z.string().trim().max(500) });
type Values = z.infer<typeof schema>;

export function ReportSheet({
  open,
  onClose,
  targetType,
  targetId,
}: {
  open: boolean;
  onClose: () => void;
  targetType: 'product' | 'user';
  targetId: string;
}) {
  const { t } = useTranslation();
  const errorMessage = useErrorMessage();
  const report = useSubmitReport();
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { note: '' } });

  const submit = form.handleSubmit((v) =>
    report.mutate(
      { targetType, targetId, reason: v.reason, note: v.note },
      {
        onSuccess: () => {
          toast.success(t('report.thanks'));
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    ),
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('report.title')}
      description={t('report.subtitle')}
      footer={
        <Button block variant="danger" loading={report.isPending} onClick={() => void submit()}>
          {t('report.submit')}
        </Button>
      }
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-4">
        <Controller
          control={form.control}
          name="reason"
          render={({ field, fieldState }) => (
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">{t('report.reason')}</legend>
              <div className="flex flex-wrap gap-2">
                {REPORT_REASONS.map((r) => (
                  <Chip key={r} selected={field.value === r} onClick={() => field.onChange(r)}>
                    {t(`reportReason.${r}`)}
                  </Chip>
                ))}
              </div>
              {fieldState.error ? <p className="mt-1.5 text-xs font-medium text-danger">{t('report.pickReason')}</p> : null}
            </fieldset>
          )}
        />
        <Controller
          control={form.control}
          name="note"
          render={({ field }) => (
            <Textarea label={t('report.note')} optionalLabel={t('common.optional')} maxLength={500} rows={3} {...field} />
          )}
        />
      </form>
    </BottomSheet>
  );
}
