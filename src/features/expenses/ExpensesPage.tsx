import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2, Wallet } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  BarList,
  BottomSheet,
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  Money,
  NumberInput,
  PageHeader,
  PeriodPicker,
  Section,
  Select,
  toast,
} from '../../components/ui';
import { EXPENSE_CATEGORIES, type Expense } from '../../lib/api/types';
import { formatDate, formatEtb } from '../../lib/format';
import { localToday, periodFromParam, periodToParam, resolvePeriod } from '../../lib/period';
import { showConfirm } from '../../lib/telegram';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useShopSettings } from '../auth/hooks';
import { useDeleteExpense, useExpenses, useSaveExpense } from './api';
import { expenseSchema, type ExpenseForm } from './schema';

export default function ExpensesPage() {
  const { t, i18n } = useTranslation();
  const settings = useShopSettings();
  const tz = settings?.timezone ?? 'Africa/Addis_Ababa';
  const [params, setParams] = useSearchParams();
  const period = periodFromParam(params.get('period'), { preset: 'this_month' });
  const range = resolvePeriod(period, tz);
  const expenses = useExpenses(range);
  const first = expenses.data?.pages[0];
  const items = expenses.data?.pages.flatMap((p) => p.items) ?? [];
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);

  return (
    <div className="space-y-4">
      <PageHeader title={t('expenses.title')} action={<IconButton icon={Plus} label={t('expenses.add')} variant="active" onClick={() => setEditing('new')} />} />
      <PeriodPicker
        value={period}
        timeZone={tz}
        onChange={(p) =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set('period', periodToParam(p));
              return next;
            },
            { replace: true },
          )
        }
      />
      {expenses.isPending ? (
        <ListSkeleton rows={5} />
      ) : expenses.isError ? (
        <ErrorState error={expenses.error} onRetry={() => void expenses.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('expenses.emptyTitle')}
          description={t('expenses.emptyBody')}
          action={
            <Button block icon={Plus} onClick={() => setEditing('new')}>
              {t('expenses.add')}
            </Button>
          }
        />
      ) : (
        <>
          <Card className="space-y-3">
            <div>
              <p className="text-xs text-hint">{t('expenses.total', { count: first?.total_count ?? 0 })}</p>
              <Money value={first?.total_amount ?? 0} className="text-2xl font-bold" />
            </div>
            <BarList data={(first?.by_category ?? []).map((c) => ({ key: c.category, label: t(`expenseCategory.${c.category}`), value: c.amount, display: formatEtb(c.amount) }))} />
          </Card>
          <Section title={t('expenses.list')}>
            <ListGroup>
              {items.map((e) => (
                <ListRow
                  key={e.id}
                  onClick={() => setEditing(e)}
                  title={t(`expenseCategory.${e.category}`)}
                  subtitle={[formatDate(e.spent_on, i18n.language), e.note].filter(Boolean).join(' · ')}
                  trailing={<Money value={e.amount} />}
                />
              ))}
            </ListGroup>
          </Section>
          {expenses.hasNextPage ? (
            <Button block variant="secondary" loading={expenses.isFetchingNextPage} onClick={() => void expenses.fetchNextPage()}>
              {t('common.loadMore')}
            </Button>
          ) : null}
        </>
      )}
      {editing !== null ? <ExpenseSheet key={editing === 'new' ? 'new' : editing.id} expense={editing === 'new' ? null : editing} today={localToday(tz)} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ExpenseSheet({ expense, today, onClose }: { expense: Expense | null; today: string; onClose: () => void }) {
  const { t } = useTranslation();
  const save = useSaveExpense();
  const del = useDeleteExpense();
  const errorMessage = useErrorMessage();
  const form = useForm<ExpenseForm>({
    resolver: zodResolver(expenseSchema),
    defaultValues: {
      spent_on: expense?.spent_on ?? today,
      category: expense?.category ?? 'other',
      amount: expense?.amount ?? (null as unknown as number),
      note: expense?.note ?? '',
    },
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const submit = form.handleSubmit((v) =>
    save.mutate(
      { ...(expense ? { id: expense.id } : {}), input: v },
      {
        onSuccess: () => {
          toast.success(t('expenses.saved'));
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    ),
  );
  const remove = async () => {
    if (!expense || !(await showConfirm(t('expenses.confirmDelete')))) return;
    del.mutate(expense.id, {
      onSuccess: () => {
        toast.success(t('expenses.deleted'));
        onClose();
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <BottomSheet
      open
      onClose={onClose}
      title={expense ? t('expenses.edit') : t('expenses.add')}
      footer={
        <div className="flex gap-2">
          {expense ? <IconButton icon={Trash2} label={t('expenses.delete')} variant="surface" className="text-danger" onClick={() => void remove()} /> : null}
          <Button block loading={save.isPending} onClick={() => void submit()}>
            {t('common.save')}
          </Button>
        </div>
      }
    >
      <div className="space-y-4 pt-1">
        <Controller
          control={form.control}
          name="amount"
          render={({ field }) => (
            <NumberInput label={t('expenses.amount')} prefix="ETB" decimals={2} autoFocus value={field.value ?? null} onChange={field.onChange} error={err(form.formState.errors.amount?.message)} />
          )}
        />
        <Select label={t('expenses.category')} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: t(`expenseCategory.${c}`) }))} {...form.register('category')} />
        <Input type="date" label={t('expenses.date')} max={today} error={err(form.formState.errors.spent_on?.message)} {...form.register('spent_on')} />
        <Input label={t('expenses.note')} optionalLabel={t('common.optional')} maxLength={300} {...form.register('note')} />
      </div>
    </BottomSheet>
  );
}
