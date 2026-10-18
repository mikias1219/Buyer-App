import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus } from 'lucide-react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Input, Money, Notice, NumberInput, toast } from '../../../components/ui';
import type { Product } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useRestock } from '../api';
import { isValidQty, isWholeUnit, weightedAverageCost } from '../logic';
import { restockSchema, type RestockForm } from '../schema';

export function RestockSheet({ product, open, onClose }: { product: Product; open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const restock = useRestock();
  const errorMessage = useErrorMessage();
  const owner = product.avg_cost !== undefined;
  const form = useForm<RestockForm>({
    resolver: zodResolver(restockSchema),
    defaultValues: { qty: null as unknown as number, unit_cost: owner ? (product.avg_cost ?? null) : null, supplier: '', note: '' },
  });
  const { control, register, handleSubmit, formState, reset, setError } = form;
  const [qty, unitCost] = useWatch({ control, name: ['qty', 'unit_cost'] });
  const err = (m?: string) => (m ? t(m) : undefined);
  const newAvg =
    owner && qty > 0 && unitCost !== null ? weightedAverageCost(product.stock_qty, product.avg_cost ?? 0, qty, unitCost) : null;

  const submit = handleSubmit((v) => {
    if (!isValidQty(product.unit, v.qty)) {
      setError('qty', { message: 'validation.wholeNumber' });
      return;
    }
    restock.mutate(
      {
        items: [{ product_id: product.id, qty: v.qty, ...(owner && v.unit_cost !== null ? { unit_cost: v.unit_cost } : {}) }],
        supplier: v.supplier,
        note: v.note,
      },
      {
        onSuccess: () => {
          toast.success(t('stockOps.restocked'));
          reset();
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
      title={t('stockOps.restockTitle')}
      description={product.name}
      footer={
        <Button block icon={PackagePlus} loading={restock.isPending} onClick={() => void submit()}>
          {t('stockOps.restock')}
        </Button>
      }
    >
      <div className="space-y-4 pt-1">
        <Controller
          control={control}
          name="qty"
          render={({ field }) => (
            <NumberInput
              label={t('stockOps.qtyReceived')}
              suffix={t(`unitShort.${product.unit}`, { count: 2 })}
              decimals={isWholeUnit(product.unit) ? 0 : 3}
              value={field.value ?? null}
              onChange={field.onChange}
              error={err(formState.errors.qty?.message)}
              autoFocus
            />
          )}
        />
        {owner ? (
          <Controller
            control={control}
            name="unit_cost"
            render={({ field }) => (
              <NumberInput
                label={t('stockOps.unitCost')}
                hint={t('stockOps.unitCostHint')}
                prefix="ETB"
                decimals={2}
                value={field.value}
                onChange={field.onChange}
                error={err(formState.errors.unit_cost?.message)}
              />
            )}
          />
        ) : (
          <Notice>{t('stockOps.staffCostNote')}</Notice>
        )}
        {newAvg !== null ? (
          <p className="text-sm text-hint">
            {t('stockOps.newAverage')} <Money value={newAvg} className="font-semibold text-ink" />
          </p>
        ) : null}
        <Input label={t('stockOps.supplier')} optionalLabel={t('common.optional')} maxLength={120} {...register('supplier')} />
        <Input label={t('stockOps.note')} optionalLabel={t('common.optional')} maxLength={300} {...register('note')} />
      </div>
    </BottomSheet>
  );
}
