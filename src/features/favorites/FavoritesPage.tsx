import { Heart, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState, ErrorState, GridSkeleton, ListingCard, PageHeader } from '../../components/ui';
import { useFavorites } from '../listings/api';

export default function FavoritesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const favorites = useFavorites();
  return (
    <div className="space-y-4">
      <PageHeader title={t('favorites.title')} subtitle={t('favorites.subtitle')} />
      {favorites.isPending ? (
        <GridSkeleton count={4} />
      ) : favorites.isError ? (
        <ErrorState error={favorites.error} onRetry={() => void favorites.refetch()} />
      ) : favorites.data.length === 0 ? (
        <EmptyState
          icon={Heart}
          title={t('favorites.emptyTitle')}
          description={t('favorites.emptyBody')}
          action={
            <Button block icon={Search} onClick={() => navigate('/search')}>
              {t('favorites.browse')}
            </Button>
          }
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {favorites.data.map((f) => (
            <li key={f.id}>
              <ListingCard
                item={f}
                dimmed={!f.available}
                note={f.available ? undefined : f.status === 'sold' ? t('status.sold') : t('favorites.unavailable')}
                className="h-full"
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
