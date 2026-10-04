import { Lightbulb } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImageUploader, Notice } from '../../../components/ui';
import { MAX_PHOTOS } from '../schema';
import type { usePhotoUploads } from '../usePhotoUploads';

export function PhotosStep({ photos, error }: { photos: ReturnType<typeof usePhotoUploads>; error?: string | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold">{t('sell.photos.title')}</h2>
        <p className="text-sm text-hint">{t('sell.photos.subtitle', { max: MAX_PHOTOS })}</p>
      </div>
      <ImageUploader
        items={photos.items}
        max={MAX_PHOTOS}
        onAdd={photos.add}
        onRemove={photos.remove}
        onMove={photos.move}
        onMakeCover={photos.makeCover}
        onRetry={photos.retry}
      />
      {error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
      <Notice tone="brand" icon={Lightbulb} title={t('sell.photos.tipsTitle')}>
        <ul className="list-disc space-y-0.5 pl-4">
          <li>{t('sell.photos.tip1')}</li>
          <li>{t('sell.photos.tip2')}</li>
          <li>{t('sell.photos.tip3')}</li>
        </ul>
      </Notice>
    </div>
  );
}
