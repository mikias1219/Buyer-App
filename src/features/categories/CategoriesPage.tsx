import { Archive, ArchiveRestore, FolderPlus, FolderTree, Pencil } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  BottomSheet,
  Button,
  EmptyState,
  ErrorState,
  IconButton,
  Input,
  ListGroup,
  ListRow,
  ListSkeleton,
  PageHeader,
  toast,
} from '../../components/ui';
import type { Category } from '../../lib/api/types';
import { useErrorMessage } from '../../lib/useErrorMessage';
import { useArchiveCategory, useCategories, useSaveCategory } from '../products/api';

export default function CategoriesPage() {
  const { t } = useTranslation();
  const categories = useCategories(true);
  const save = useSaveCategory();
  const archive = useArchiveCategory();
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [name, setName] = useState('');

  const open = (c: Category | 'new') => {
    setEditing(c);
    setName(c === 'new' ? '' : c.name);
  };
  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    save.mutate(editing && editing !== 'new' ? { id: editing.id, name: trimmed, sort: editing.sort } : { name: trimmed, sort: (categories.data?.length ?? 0) * 10 }, {
      onSuccess: () => {
        toast.success(t('categories.saved'));
        setEditing(null);
      },
      onError: (e) => toast.error(errorMessage(e)),
    });
  };

  return (
    <div className="space-y-4">
      <PageHeader title={t('categories.title')} action={<IconButton icon={FolderPlus} label={t('categories.add')} variant="active" onClick={() => open('new')} />} />
      {categories.isPending ? (
        <ListSkeleton rows={4} />
      ) : categories.isError ? (
        <ErrorState error={categories.error} onRetry={() => void categories.refetch()} />
      ) : categories.data.length === 0 ? (
        <EmptyState
          icon={FolderTree}
          title={t('categories.emptyTitle')}
          description={t('categories.emptyBody')}
          action={
            <Button block icon={FolderPlus} onClick={() => open('new')}>
              {t('categories.add')}
            </Button>
          }
        />
      ) : (
        <ListGroup>
          {categories.data.map((c) => (
            <ListRow
              key={c.id}
              title={c.name}
              subtitle={c.archived ? t('categories.archived') : t('products.count', { count: c.product_count })}
              trailing={
                <span className="flex gap-1">
                  <IconButton icon={Pencil} size="sm" label={t('common.edit')} onClick={() => open(c)} />
                  <IconButton
                    icon={c.archived ? ArchiveRestore : Archive}
                    size="sm"
                    label={c.archived ? t('categories.restore') : t('categories.archive')}
                    onClick={() =>
                      archive.mutate({ id: c.id, archived: !c.archived }, { onError: (e) => toast.error(errorMessage(e)) })
                    }
                  />
                </span>
              }
            />
          ))}
        </ListGroup>
      )}
      <BottomSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? t('categories.add') : t('categories.rename')}
        footer={
          <Button block loading={save.isPending} disabled={!name.trim()} onClick={submit}>
            {t('common.save')}
          </Button>
        }
      >
        <Input
          label={t('categories.name')}
          maxLength={60}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
      </BottomSheet>
    </div>
  );
}
