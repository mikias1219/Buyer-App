import { zodResolver } from '@hookform/resolvers/zod';
import { Archive, HandCoins, Pencil, Phone, Receipt } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Input,
  ListGroup,
  ListRow,
  Money,
  NumberInput,
  PageSkeleton,
  Section,
  toast,
} from '../../components/ui';
import { DEBT_PAYMENT_METHODS, type CustomerDetail } from '../../lib/api/types';
import { formatDate } from '../../lib/format';
import { showConfirm } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useArchiveCustomer, useCustomer, useRecordPayment } from './api';
import { CustomerSheet } from './CustomerSheet';
import { paymentSchema, type PaymentForm } from './schema';

export default function CustomerDetailPage() {
  const { id = '' } = useParams();
  const customer = useCustomer(id);
  if (customer.isPending) return <PageSkeleton />;
  if (customer.isError) return <ErrorState error={customer.error} onRetry={() => void customer.refetch()} />;
  return <CustomerView c={customer.data} />;
}

function CustomerView({ c }: { c: CustomerDetail }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [sheet, setSheet] = useState<'pay' | 'edit' | null>(null);
  const archive = useArchiveCustomer();
  const errorMessage = useErrorMessage();
  const history = [
    ...(c.sales ?? []).map((s) => ({ kind: 'sale' as const, at: s.sold_at, s })),
    ...(c.payments ?? []).map((p) => ({ kind: 'payment' as const, at: p.created_at, p })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="space-y-5">
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold">{c.name}</h1>
            {c.phone ? (
              <a href={`tel:${c.phone}`} className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-brand">
                <Phone aria-hidden className="size-4" />
                {c.phone}
              </a>
            ) : null}
          </div>
          {c.archived ? <Badge>{t('customers.archived')}</Badge> : null}
        </div>
        <div>
          <p className="text-xs text-hint">{c.balance >= 0 ? t('customers.owesNow') : t('customers.creditNow')}</p>
          <Money value={Math.abs(c.balance)} className={`text-3xl font-bold ${c.balance > 0 ? 'text-warning' : ''}`} />
        </div>
        {c.note ? <p className="text-sm text-hint">{c.note}</p> : null}
        <div className="grid grid-cols-2 gap-2">
          <Button icon={HandCoins} disabled={c.balance <= 0} onClick={() => setSheet('pay')}>
            {t('customers.recordPayment')}
          </Button>
          <Button variant="secondary" icon={Pencil} onClick={() => setSheet('edit')}>
            {t('common.edit')}
          </Button>
        </div>
      </Card>

      <Section title={t('customers.history')}>
        {history.length === 0 ? (
          <EmptyState icon={Receipt} title={t('customers.noHistory')} className="py-6" />
        ) : (
          <ListGroup>
            {history.map((h) =>
              h.kind === 'sale' ? (
                <ListRow
                  key={`s-${h.s.id}`}
                  to={`/sales/${h.s.id}`}
                  title={t('customers.creditSale', { no: h.s.receipt_no })}
                  subtitle={`${formatDate(h.s.sold_at, i18n.language)}${h.s.status === 'voided' ? ` · ${t('receipt.voided')}` : h.s.refunded > 0 ? ` · ${t('receipt.partlyReturned')}` : ''}`}
                  trailing={<Money value={h.s.status === 'voided' ? 0 : h.s.total - h.s.refunded} />}
                />
              ) : (
                <ListRow
                  key={`p-${h.p.id}`}
                  title={t('customers.payment', { method: t(`paymentMethod.${h.p.method}`) })}
                  subtitle={[formatDate(h.p.created_at, i18n.language), h.p.created_by_name, h.p.note].filter(Boolean).join(' · ')}
                  trailing={<Money value={-h.p.amount} className="text-success" />}
                />
              ),
            )}
          </ListGroup>
        )}
      </Section>

      {!c.archived ? (
        <Button
          block
          variant="ghost"
          icon={Archive}
          className="text-danger"
          loading={archive.isPending}
          onClick={async () => {
            if (!(await showConfirm(t('customers.confirmArchive', { name: c.name })))) return;
            archive.mutate({ id: c.id, archived: true }, { onSuccess: () => navigate('/more/customers', { replace: true }), onError: (e) => toast.error(errorMessage(e)) });
          }}
        >
          {t('customers.archive')}
        </Button>
      ) : null}

      {sheet === 'pay' ? <PaymentSheet customerId={c.id} balance={c.balance} onClose={() => setSheet(null)} /> : null}
      {sheet === 'edit' ? <CustomerSheet customer={c} onClose={() => setSheet(null)} /> : null}
    </div>
  );
}

function PaymentSheet({ customerId, balance, onClose }: { customerId: string; balance: number; onClose: () => void }) {
  const { t } = useTranslation();
  const pay = useRecordPayment();
  const errorMessage = useErrorMessage();
  const form = useForm<PaymentForm>({ resolver: zodResolver(paymentSchema), defaultValues: { amount: balance, method: 'cash', note: '' } });
  const method = useWatch({ control: form.control, name: 'method' });
  const submit = form.handleSubmit((v) => {
    if (v.amount > balance) {
      form.setError('amount', { message: 'errors.exceeds_balance' });
      return;
    }
    pay.mutate(
      { customerId, amount: v.amount, method: v.method, note: v.note },
      {
        onSuccess: () => {
          toast.success(t('customers.paymentSaved'));
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  });
  return (
    <BottomSheet
      open
      onClose={onClose}
      title={t('customers.recordPayment')}
      footer={
        <Button block icon={HandCoins} loading={pay.isPending} onClick={() => void submit()}>
          {t('customers.savePayment')}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <Controller
          control={form.control}
          name="amount"
          render={({ field }) => (
            <NumberInput
              label={t('customers.amount')}
              hint={t('customers.owesHint', { value: balance.toLocaleString('en-US') })}
              prefix="ETB"
              decimals={2}
              max={balance}
              value={field.value ?? null}
              onChange={field.onChange}
              error={form.formState.errors.amount?.message ? t(form.formState.errors.amount.message) : undefined}
            />
          )}
        />
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('sell.payment')}>
          {DEBT_PAYMENT_METHODS.map((m) => (
            <Chip key={m} role="radio" aria-checked={method === m} selected={method === m} onClick={() => form.setValue('method', m)}>
              {t(`paymentMethod.${m}`)}
            </Chip>
          ))}
        </div>
        <Input label={t('customers.note')} optionalLabel={t('common.optional')} maxLength={300} {...form.register('note')} />
      </div>
    </BottomSheet>
  );
}
