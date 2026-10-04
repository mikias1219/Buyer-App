import { AlertCircle, ArrowLeft, ArrowRight, Camera, ImagePlus, RotateCw, Star, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Spinner } from './Spinner';
import { cn } from './cn';

export interface UploadItem {
  key: string;
  /** Display URL (object URL while uploading, storage URL afterwards). */
  url: string;
  status: 'uploading' | 'done' | 'error';
}

interface ImageUploaderProps {
  items: UploadItem[];
  max?: number;
  onAdd: (files: File[]) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: -1 | 1) => void;
  onMakeCover: (key: string) => void;
  onRetry: (key: string) => void;
}

/** Multi-photo picker: first photo is the cover; reorder with arrows (works without drag & drop). */
export function ImageUploader({ items, max = 8, onAdd, onRemove, onMove, onMakeCover, onRetry }: ImageUploaderProps) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const remaining = max - items.length;

  return (
    <div>
      <ul className="grid grid-cols-3 gap-2" aria-label={t('uploader.photos')}>
        {items.map((it, i) => (
          <li key={it.key} className="relative aspect-square overflow-hidden rounded-input bg-surface-2">
            <img src={it.url} alt="" className={cn('h-full w-full object-cover', it.status !== 'done' && 'opacity-60')} />
            {i === 0 ? (
              <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-contrast">
                <Star aria-hidden className="size-3" />
                {t('uploader.cover')}
              </span>
            ) : null}
            {it.status === 'uploading' ? (
              <span className="absolute inset-0 flex items-center justify-center text-white" role="status" aria-label={t('uploader.uploading')}>
                <Spinner className="size-7 drop-shadow" />
              </span>
            ) : null}
            {it.status === 'error' ? (
              <button
                type="button"
                onClick={() => onRetry(it.key)}
                className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/55 text-xs font-semibold text-white"
              >
                <AlertCircle aria-hidden className="size-6" />
                <span className="inline-flex items-center gap-1">
                  <RotateCw aria-hidden className="size-3.5" /> {t('common.retry')}
                </span>
              </button>
            ) : null}
            {it.status === 'done' ? (
              <div className="absolute inset-x-0 bottom-0 flex justify-between bg-gradient-to-t from-black/60 to-transparent p-1">
                <span className="flex gap-0.5">
                  <SmallButton label={t('uploader.moveLeft')} disabled={i === 0} onClick={() => onMove(it.key, -1)}>
                    <ArrowLeft aria-hidden className="size-4" />
                  </SmallButton>
                  <SmallButton label={t('uploader.moveRight')} disabled={i === items.length - 1} onClick={() => onMove(it.key, 1)}>
                    <ArrowRight aria-hidden className="size-4" />
                  </SmallButton>
                </span>
                <span className="flex gap-0.5">
                  {i !== 0 ? (
                    <SmallButton label={t('uploader.makeCover')} onClick={() => onMakeCover(it.key)}>
                      <Star aria-hidden className="size-4" />
                    </SmallButton>
                  ) : null}
                  <SmallButton label={t('uploader.remove')} onClick={() => onRemove(it.key)}>
                    <Trash2 aria-hidden className="size-4" />
                  </SmallButton>
                </span>
              </div>
            ) : null}
          </li>
        ))}
        {remaining > 0 ? (
          <li className="aspect-square">
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="press flex h-full w-full flex-col items-center justify-center gap-1 rounded-input border-2 border-dashed border-brand/40 bg-brand-soft text-brand"
            >
              {items.length === 0 ? <Camera aria-hidden className="size-7" /> : <ImagePlus aria-hidden className="size-7" />}
              <span className="text-xs font-semibold">{t('uploader.add')}</span>
              <span className="tabular text-[11px] opacity-80">
                {items.length}/{max}
              </span>
            </button>
          </li>
        ) : null}
      </ul>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).slice(0, remaining);
          e.target.value = '';
          if (files.length) onAdd(files);
        }}
      />
    </div>
  );
}

function SmallButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex size-8 items-center justify-center rounded-full text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
