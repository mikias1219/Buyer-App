import { zodResolver } from '@hookform/resolvers/zod';
import { PackagePlus } from 'lucide-react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { BottomSheet, Button, Notice, NumberInput, toast } from '../../../components/ui';
import type { Product } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useRestock } from '../api';
import { isValidQty, isWholeUnit } from '../logic';
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
  const { control, handleSubmit, formState, reset, setError } = form;
  const err = (m?: string) => (m ? t(m) : undefined);

  const submit = handleSubmit((v) => {
    if (!isValidQty(product.unit, v.qty)) {
      setError('qty', { message: 'validation.wholeNumber' });
      return;
    }
    restock.mutate(
      {
        items: [{ product_id: product.id, qty: v.qty, ...(owner && v.unit_cost !== null ? { unit_cost: v.unit_cost } : {}) }],
        supplier: '',
        note: '',
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
      </div>
    </BottomSheet>
  );
}
