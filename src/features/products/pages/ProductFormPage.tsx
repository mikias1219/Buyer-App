import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorState,
  ImageUploader,
  Input,
  NumberInput,
  PageHeader,
  PageSkeleton,
  Section,
  Select,
  Textarea,
  toast,
  type UploadItem,
} from '../../../components/ui';
import { imageUrl } from '../../../lib/api/client';
import { toAppError } from '../../../lib/api/errors';
import { UNITS, type Product, type ProductInput } from '../../../lib/api/types';
import { useErrorMessage } from '../../../lib/useErrorMessage';
import { useShopSettings } from '../../auth/hooks';
import { uploadProductImage, useCategories, useProduct, useSaveProduct } from '../api';
import { isWholeUnit } from '../logic';
import { productSchema, type ProductForm } from '../schema';

export default function ProductFormPage() {
  const { id } = useParams();
  const product = useProduct(id);
  if (id && product.isPending) return <PageSkeleton />;
  if (id && product.isError) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />;
  return <ProductFormView key={product.data?.id ?? 'new'} product={product.data} />;
}

function ProductFormView({ product }: { product: Product | undefined }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const settings = useShopSettings();
  const categories = useCategories();
  const save = useSaveProduct();
  const errorMessage = useErrorMessage();
  const editing = Boolean(product);

  const form = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: product?.name ?? '',
      category_id: product?.category_id ?? null,
      unit: product?.unit ?? 'piece',
      sell_price: product?.sell_price ?? (null as unknown as number),
      cost_price: product?.avg_cost ?? 0,
      opening_stock: editing ? null : 0,
      reorder_level: product?.reorder_level ?? settings?.default_reorder_level ?? 5,
      sku: product?.sku ?? '',
      barcode: product?.barcode ?? '',
      notes: product?.notes ?? '',
      image_path: product?.image_path ?? '',
    },
  });
  const { control, register, handleSubmit, formState, setValue, setError } = form;
  const [unit, name, notes, imagePath, sellPrice, costPrice] = useWatch({
    control,
    name: ['unit', 'name', 'notes', 'image_path', 'sell_price', 'cost_price'],
  });
  const err = (m?: string) => (m ? t(m) : undefined);
  const decimals = isWholeUnit(unit) ? 0 : 3;

  const [photo, setPhoto] = useState<UploadItem | null>(() => {
    const url = imageUrl(product?.image_path, 320);
    return url ? { key: product?.image_path ?? 'img', url, status: 'done' } : null;
  });
  const uploading = photo?.status === 'uploading';

  const addPhoto = async (file: File) => {
    const local = URL.createObjectURL(file);
    setPhoto({ key: local, url: local, status: 'uploading' });
    try {
      const path = await uploadProductImage(file);
      setValue('image_path', path, { shouldDirty: true });
      setPhoto({ key: path, url: local, status: 'done' });
    } catch (e) {
      setPhoto({ key: local, url: local, status: 'error' });
      toast.error(errorMessage(e));
    }
  };

  const submit = handleSubmit((v) => {
    const input: ProductInput = {
      name: v.name,
      category_id: v.category_id || null,
      unit: v.unit,
      sell_price: v.sell_price,
      cost_price: v.cost_price,
      reorder_level: v.reorder_level,
      sku: v.sku || null,
      barcode: v.barcode || null,
      notes: v.notes,
      image_path: v.image_path,
      ...(editing ? {} : { opening_stock: v.opening_stock ?? 0 }),
    };
    save.mutate(
      { ...(product ? { id: product.id } : {}), input },
      {
        onSuccess: (p) => {
          toast.success(t(editing ? 'productForm.saved' : 'productForm.created'));
          navigate(`/products/${p.id}`, { replace: true });
        },
        onError: (e) => {
          const code = toAppError(e).code;
          if (code === 'duplicate_sku') setError('sku', { message: 'errors.duplicate_sku' });
          else if (code === 'duplicate_barcode') setError('barcode', { message: 'errors.duplicate_barcode' });
          else if (code === 'invalid_quantity') setError('unit', { message: 'productForm.unitStockConflict' });
          toast.error(errorMessage(e));
        },
      },
    );
  });

  const margin = sellPrice > 0 && costPrice >= 0 ? Math.round(((sellPrice - costPrice) / sellPrice) * 1000) / 10 : null;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate className="space-y-5">
      <PageHeader title={editing ? t('productForm.editTitle') : t('productForm.newTitle')} />

      <Section title={t('productForm.basics')}>
        <Card className="space-y-4">
          <Input label={t('productForm.name')} maxLength={120} value={name} error={err(formState.errors.name?.message)} {...register('name')} />
          <Select
            label={t('productForm.category')}
            placeholder={t('productForm.noCategory')}
            options={(categories.data ?? []).map((c) => ({ value: c.id, label: c.name }))}
            {...register('category_id', { setValueAs: (v: string) => v || null })}
          />
          <Select
            label={t('productForm.unit')}
            hint={t('productForm.unitHint')}
            options={UNITS.map((u) => ({ value: u, label: t(`unit.${u}`) }))}
            error={err(formState.errors.unit?.message)}
            {...register('unit')}
          />
        </Card>
      </Section>

      <Section title={t('productForm.pricing')}>
        <Card className="space-y-4">
          <Controller
            control={control}
            name="sell_price"
            render={({ field }) => (
              <NumberInput label={t('productForm.sellPrice')} prefix="ETB" decimals={2} value={field.value ?? null} onChange={field.onChange} error={err(formState.errors.sell_price?.message)} />
            )}
          />
          <Controller
            control={control}
            name="cost_price"
            render={({ field }) => (
              <NumberInput
                label={editing ? t('productForm.avgCost') : t('productForm.costPrice')}
                hint={editing ? t('productForm.avgCostHint') : t('productForm.costPriceHint')}
                prefix="ETB"
                decimals={2}
                value={field.value ?? null}
                onChange={(v) => field.onChange(v ?? 0)}
                error={err(formState.errors.cost_price?.message)}
              />
            )}
          />
          {margin !== null ? <p className="text-sm text-hint">{t('productForm.marginPreview', { value: margin })}</p> : null}
        </Card>
      </Section>

      <Section title={t('productForm.stock')}>
        <Card className="space-y-4">
          {!editing ? (
            <Controller
              control={control}
              name="opening_stock"
              render={({ field }) => (
                <NumberInput
                  label={t('productForm.openingStock')}
                  hint={t('productForm.openingStockHint')}
                  suffix={t(`unitShort.${unit}`, { count: 2 })}
                  decimals={decimals}
                  value={field.value}
                  onChange={field.onChange}
                  error={err(formState.errors.opening_stock?.message)}
                />
              )}
            />
          ) : (
            <p className="text-sm text-hint">{t('productForm.stockEditNote')}</p>
          )}
          <Controller
            control={control}
            name="reorder_level"
            render={({ field }) => (
              <NumberInput
                label={t('productForm.reorderLevel')}
                hint={t('productForm.reorderHint')}
                suffix={t(`unitShort.${unit}`, { count: 2 })}
                decimals={decimals}
                value={field.value ?? null}
                onChange={(v) => field.onChange(v ?? 0)}
                error={err(formState.errors.reorder_level?.message)}
              />
            )}
          />
        </Card>
      </Section>

      <Section title={t('productForm.more')}>
        <Card className="space-y-4">
          <Input label="SKU" optionalLabel={t('common.optional')} hint={t('productForm.skuHint')} error={err(formState.errors.sku?.message)} {...register('sku')} />
          <Input
            label={t('productForm.barcode')}
            optionalLabel={t('common.optional')}
            inputMode="numeric"
            error={err(formState.errors.barcode?.message)}
            {...register('barcode')}
          />
          <div className="space-y-1.5">
            <p className="text-sm font-semibold">{t('productForm.photo')}</p>
            <ImageUploader
              items={photo ? [photo] : []}
              max={1}
              onAdd={(files) => {
                const f = files[0];
                if (f) void addPhoto(f);
              }}
              onRemove={() => {
                setPhoto(null);
                setValue('image_path', '', { shouldDirty: true });
              }}
              onMove={() => undefined}
              onMakeCover={() => undefined}
              onRetry={() => undefined}
            />
            {imagePath === '' && photo === null ? <p className="text-xs text-hint">{t('productForm.photoHint')}</p> : null}
          </div>
          <Textarea label={t('productForm.notes')} optionalLabel={t('common.optional')} rows={2} maxLength={500} value={notes} {...register('notes')} />
        </Card>
      </Section>

      <Button type="submit" block size="lg" icon={Save} loading={save.isPending} disabled={uploading}>
        {editing ? t('productForm.save') : t('productForm.create')}
      </Button>
    </form>
  );
}
