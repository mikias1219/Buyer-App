import { zodResolver } from '@hookform/resolvers/zod';
import { ClipboardCheck } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Chip, Input, Notice, NumberInput, Quantity, toast } from '../../../components/ui';
import type { Product } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useAdjustStock } from '../api';
import { isValidQty, isWholeUnit } from '../logic';
import { adjustSchema, type AdjustForm } from '../schema';

/** Owner: stock count correction ("set") or damage / loss ("loss"). */
export function AdjustSheet({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const adjust = useAdjustStock();
  const errorMessage = useErrorMessage();
  const form = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { mode: 'set', qty: product.stock_qty, reason: '' },
  });
  const { control, register, handleSubmit, formState, setValue, setError, reset } = form;
  const [mode, qty] = useWatch({ control, name: ['mode', 'qty'] });
  const after = mode === 'set' ? qty : product.stock_qty - (qty ?? 0);

  const submit = handleSubmit((v) => {
    if (!isValidQty(product.unit, v.qty)) {
      setError('qty', { message: 'validation.wholeNumber' });
      return;
    }
    adjust.mutate(
      { productId: product.id, mode: v.mode, qty: v.qty, reason: v.reason },
      {
        onSuccess: () => {
          toast.success(t('stockOps.adjusted'));
          reset({ mode: 'set', qty: v.mode === 'set' ? v.qty : product.stock_qty - v.qty, reason: '' });
          onClose();
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('stockOps.adjustTitle')}
      description={product.name}
      footer={
        <Button block icon={ClipboardCheck} loading={adjust.isPending} onClick={() => void submit()}>
          {t('stockOps.saveAdjustment')}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <div role="radiogroup" aria-label={t('stockOps.adjustType')} className="flex gap-2">
          {(['set', 'loss'] as const).map((m) => (
            <Chip
              key={m}
              role="radio"
              aria-checked={mode === m}
              selected={mode === m}
              onClick={() => {
                setValue('mode', m);
                setValue('qty', m === 'set' ? product.stock_qty : (null as unknown as number));
              }}
            >
              {t(`stockOps.mode.${m}`)}
            </Chip>
          ))}
        </div>
        <p className="text-sm text-hint">
          {t('stockOps.currentStock')} <Quantity value={product.stock_qty} unit={product.unit} className="font-semibold text-ink" />
        </p>
        <Controller
          control={control}
          name="qty"
          render={({ field }) => (
            <NumberInput
              label={mode === 'set' ? t('stockOps.countedQty') : t('stockOps.lostQty')}
              suffix={t(`unitShort.${product.unit}`, { count: 2 })}
              decimals={isWholeUnit(product.unit) ? 0 : 3}
              value={field.value ?? null}
              onChange={field.onChange}
              error={formState.errors.qty?.message ? t(formState.errors.qty.message) : undefined}
              autoFocus
            />
          )}
        />
        {qty !== null && qty !== undefined ? (
          <Notice tone={after < 0 ? 'danger' : 'brand'}>
            {t('stockOps.stockAfter')} <Quantity value={after} unit={product.unit} className="font-semibold" />
          </Notice>
        ) : null}
        <Input
          label={t('stockOps.reason')}
          placeholder={mode === 'set' ? t('stockOps.reasonSetHint') : t('stockOps.reasonLossHint')}
          maxLength={300}
          error={formState.errors.reason?.message ? t(formState.errors.reason.message) : undefined}
          {...register('reason')}
        />
      </div>
    </BottomSheet>
  );
}
