import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { PaymentSteps } from '../components/PaymentSteps';
import { RequireProfile } from '../components/RequireProfile';
import { PageHeader, SectionCard } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useProducts } from '../context/ProductsContext';
import type { ProductCategory, ProductCondition } from '../types/product';
import { formatETB } from '../utils/format';

const CATEGORIES: ProductCategory[] = [
  'Laptop',
  'Phone',
  'Tablet',
  'Accessory',
  'Other',
];

const CONDITIONS: ProductCondition[] = ['New', 'Like New', 'Good', 'Fair'];

const EMPTY = {
  title: '',
  description: '',
  price: '',
  brand: '',
  city: '',
  category: 'Phone' as ProductCategory,
  condition: 'Good' as ProductCondition,
};

function AddItemInner() {
  const navigate = useNavigate();
  const { addProduct } = useProducts();
  const { settings, profile, isBanned } = useAuth();
  const [form, setForm] = useState({ ...EMPTY, city: profile?.city || '' });
  const [preview, setPreview] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.city) {
      setForm((prev) => ({ ...prev, city: prev.city || profile.city }));
    }
  }, [profile?.city]);

  function onFieldChange(
    e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function onImageChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setError('Please choose an image under 3MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPreview(String(reader.result));
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (isBanned) {
      setError('Your account is suspended.');
      return;
    }
    setError(null);

    const title = form.title.trim();
    const description = form.description.trim();
    const price = Number(form.price);

    if (!title || !description) {
      setError('Title and description are required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Enter a valid price in ETB.');
      return;
    }
    if (!preview) {
      setError('Add a product photo.');
      return;
    }

    setSubmitting(true);
    try {
      const product = await addProduct({
        title,
        description,
        price,
        category: form.category,
        condition: form.condition,
        image_url: preview,
        brand: form.brand.trim(),
        city: form.city.trim() || profile?.city || '',
      });
      if (product.status === 'pending_payment') {
        navigate(`/pay/${product.id}`, { replace: true });
      } else {
        navigate(`/product/${product.id}`, { replace: true });
      }
    } catch {
      setError('Could not save listing. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const fieldClass =
    'w-full rounded-xl border-0 bg-[var(--tg-theme-bg-color,#efeff4)] px-3 py-2.5 text-[15px] text-[var(--tg-theme-text-color,#000)] outline-none placeholder:text-[var(--tg-theme-hint-color,#8e8e93)] focus:ring-2 focus:ring-[var(--tg-theme-button-color,#2481cc)]/40';

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="Sell an item"
        subtitle="Buyers cannot see your contact until the fee is paid"
      />

      <PaymentSteps current={1} />

      <SectionCard className="!bg-amber-500/12 !py-3">
        <p className="text-[14px] font-semibold text-amber-950 dark:text-amber-100">
          Listing fee: {formatETB(settings.listing_fee_etb)}
        </p>
        <p className="mt-1 text-[12px] leading-snug text-amber-900/85 dark:text-amber-100/85">
          After this form you will pay via Telebirr. Until admin confirms payment, your
          Telegram contact stays hidden.
        </p>
      </SectionCard>

      <form
        onSubmit={onSubmit}
        className="space-y-3 rounded-2xl bg-[var(--tg-theme-secondary-bg-color,#fff)] p-3.5 shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      >
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
            Photo
          </span>
          <div className="relative overflow-hidden rounded-xl bg-[var(--tg-theme-bg-color,#efeff4)]">
            {preview ? (
              <img src={preview} alt="Preview" className="h-44 w-full object-cover" />
            ) : (
              <div className="flex h-44 flex-col items-center justify-center gap-1 text-[var(--tg-theme-hint-color,#8e8e93)]">
                <span className="text-[28px] leading-none">+</span>
                <span className="text-[13px]">Tap to upload</span>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onImageChange}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </div>
        </label>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
            Title
          </span>
          <input
            name="title"
            value={form.title}
            onChange={onFieldChange}
            placeholder="e.g. MacBook Air M1 8/256"
            maxLength={80}
            className={fieldClass}
            required
          />
        </label>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
            Description
          </span>
          <textarea
            name="description"
            value={form.description}
            onChange={onFieldChange}
            placeholder="Condition details, what's included, meetup area…"
            rows={4}
            maxLength={800}
            className={`${fieldClass} resize-none`}
            required
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Price (ETB)
            </span>
            <input
              name="price"
              type="number"
              inputMode="numeric"
              min={1}
              value={form.price}
              onChange={onFieldChange}
              placeholder="25000"
              className={fieldClass}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Brand
            </span>
            <input
              name="brand"
              value={form.brand}
              onChange={onFieldChange}
              placeholder="Apple"
              className={fieldClass}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
            City
          </span>
          <input
            name="city"
            value={form.city}
            onChange={onFieldChange}
            placeholder="Addis Ababa"
            className={fieldClass}
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Category
            </span>
            <select
              name="category"
              value={form.category}
              onChange={onFieldChange}
              className={fieldClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-[var(--tg-theme-hint-color,#8e8e93)]">
              Condition
            </span>
            <select
              name="condition"
              value={form.condition}
              onChange={onFieldChange}
              className={fieldClass}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="text-[13px] text-[var(--tg-theme-destructive-text-color,#ff3b30)]">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-[var(--tg-theme-button-color,#2481cc)] py-3 text-[16px] font-semibold text-[var(--tg-theme-button-text-color,#fff)] disabled:opacity-60"
        >
          {submitting ? 'Creating…' : 'Continue to payment'}
        </button>
      </form>
    </div>
  );
}

export function AddItem() {
  return (
    <RequireProfile>
      <AddItemInner />
    </RequireProfile>
  );
}
