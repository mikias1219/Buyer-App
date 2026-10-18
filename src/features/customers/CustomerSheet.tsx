import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Input, Textarea, toast } from '../../components/ui';
import type { Customer } from '../../lib/api/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useSaveCustomer } from './api';
import { customerSchema, type CustomerForm } from './schema';

export function CustomerSheet({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved?: (c: Customer) => void }) {
  const { t } = useTranslation();
  const save = useSaveCustomer();
  const errorMessage = useErrorMessage();
  const form = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: customer?.name ?? '', phone: customer?.phone ?? '', note: customer?.note ?? '' },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const submit = form.handleSubmit((v) =>
    save.mutate(
      { ...(customer ? { id: customer.id } : {}), ...customerSchema.parse(v) },
      {
        onSuccess: (c) => {
          toast.success(t('customers.saved'));
          onSaved?.(c);
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    ),
  );
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={customer ? t('customers.edit') : t('customers.add')}
      footer={
        <Button block loading={save.isPending} onClick={() => void submit()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <Input label={t('customers.name')} maxLength={80} error={err(form.formState.errors.name?.message)} {...form.register('name')} />
        <Input label={t('customers.phone')} optionalLabel={t('common.optional')} inputMode="tel" error={err(form.formState.errors.phone?.message)} {...form.register('phone')} />
        <Textarea label={t('customers.note')} optionalLabel={t('common.optional')} rows={2} maxLength={300} {...form.register('note')} />
      </div>
    </BottomSheet>
  );
}
