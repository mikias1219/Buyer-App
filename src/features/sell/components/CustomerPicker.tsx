import { zodResolver } from '@hookform/resolvers/zod';
import { Search, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, EmptyState, ErrorState, Input, ListGroup, ListRow, ListSkeleton, Money, toast } from '../../../components/ui';
import type { Customer } from '../../../lib/api/types';
import { useDebounced } from '../../../lib/useDebounced';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useCustomers, useSaveCustomer } from '../../customers/api';
import { customerSchema, type CustomerForm } from '../../customers/schema';

/** Pick an existing customer or add one on the spot (credit sales). */
export function CustomerPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Customer) => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const query = useDebounced(q.trim());
  const customers = useCustomers(query);
  const save = useSaveCustomer();
  const errorMessage = useErrorMessage();
  const list = customers.data?.pages.flatMap((p) => p.items) ?? [];
  const form = useForm<CustomerForm>({ resolver: zodResolver(customerSchema), defaultValues: { name: '', phone: '', note: '' } });
  const err = (m?: string) => (m ? t(m) : undefined);

  const create = form.handleSubmit((v) =>
    save.mutate(customerSchema.parse(v), {
      onSuccess: (c) => {
        onPick(c);
        setAdding(false);
        form.reset();
      },
      onError: (e) => toast.error(errorMessage(e)),
    }),
  );

  return (
    <BottomSheet open={open} onClose={onClose} title={adding ? t('customers.add') : t('customers.pick')} size="tall">
      {adding ? (
        <div className="space-y-4 pt-1">
          <Input label={t('customers.name')} maxLength={80} error={err(form.formState.errors.name?.message)} {...form.register('name')} />
          <Input label={t('customers.phone')} optionalLabel={t('common.optional')} inputMode="tel" error={err(form.formState.errors.phone?.message)} {...form.register('phone')} />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)}>
              {t('common.cancel')}
            </Button>
            <Button block loading={save.isPending} onClick={() => void create()}>
              {t('customers.addAndPick')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 pt-1">
          <Input type="search" aria-label={t('customers.search')} placeholder={t('customers.search')} leading={<Search aria-hidden className="size-5" />} value={q} onChange={(e) => setQ(e.target.value)} />
          <Button block variant="soft" icon={UserPlus} onClick={() => {
            form.reset({ name: q.trim(), phone: '', note: '' });
            setAdding(true);
          }}>
            {t('customers.add')}
          </Button>
          {customers.isPending ? (
            <ListSkeleton rows={4} />
          ) : customers.isError ? (
            <ErrorState error={customers.error} onRetry={() => void customers.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState icon={Search} title={t('customers.noneFound')} className="py-6" />
          ) : (
            <ListGroup>
              {list.map((c) => (
                <ListRow
                  key={c.id}
                  title={c.name}
                  subtitle={c.phone || undefined}
                  trailing={c.balance > 0 ? <Money value={c.balance} className="text-warning" /> : undefined}
                  meta={c.balance > 0 ? <span className="text-xs text-hint">{t('customers.owes')}</span> : undefined}
                  onClick={() => onPick(c)}
                />
              ))}
            </ListGroup>
          )}
        </div>
      )}
    </BottomSheet>
  );
}
