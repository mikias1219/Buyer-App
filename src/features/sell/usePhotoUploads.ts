import { useCallback, useRef, useState } from 'react';
import type { UploadItem } from '../../components/ui';
import { imageUrl } from '../../lib/api/client';
import type { ListingImage } from '../../lib/api/types';
import { uploadListingPhoto } from './api';

interface Entry extends UploadItem {
  file?: File;
  image?: ListingImage;
}

/** Photo list state: parallel uploads with per-item progress/retry; order = display order. */
export function usePhotoUploads(productId: string, initial: ListingImage[]) {
  const [items, setItems] = useState<Entry[]>(() =>
    initial.map((img) => ({ key: img.path, url: imageUrl(img.path, 400) ?? '', status: 'done', image: img })),
  );
  const dirty = useRef(false);

  const upload = useCallback(
    (key: string, file: File) => {
      setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'uploading' } : it)));
      uploadListingPhoto(productId, file)
        .then((image) => {
          dirty.current = true;
          setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'done', image } : it)));
        })
        .catch(() => setItems((list) => list.map((it) => (it.key === key ? { ...it, status: 'error' } : it))));
    },
    [productId],
  );

  const add = (files: File[]) => {
    const entries: Entry[] = files.map((file) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      url: URL.createObjectURL(file),
      status: 'uploading',
      file,
    }));
    setItems((list) => [...list, ...entries].slice(0, 8));
    entries.forEach((e) => e.file && upload(e.key, e.file));
  };

  const retry = (key: string) => {
    const it = items.find((x) => x.key === key);
    if (it?.file) upload(key, it.file);
  };

  const remove = (key: string) => {
    dirty.current = true;
    setItems((list) => list.filter((it) => it.key !== key));
  };

  const move = (key: string, dir: -1 | 1) => {
    dirty.current = true;
    setItems((list) => {
      const i = list.findIndex((x) => x.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      const a = next[i];
      const b = next[j];
      if (!a || !b) return list;
      next[i] = b;
      next[j] = a;
      return next;
    });
  };

  const makeCover = (key: string) => {
    dirty.current = true;
    setItems((list) => {
      const it = list.find((x) => x.key === key);
      return it ? [it, ...list.filter((x) => x.key !== key)] : list;
    });
  };

  const images: ListingImage[] = items.flatMap((it) => (it.status === 'done' && it.image ? [it.image] : []));
  return {
    items: items as UploadItem[],
    images,
    uploading: items.some((it) => it.status === 'uploading'),
    failed: items.some((it) => it.status === 'error'),
    isDirty: () => dirty.current,
    markSaved: () => {
      dirty.current = false;
    },
    add,
    retry,
    remove,
    move,
    makeCover,
  };
}
