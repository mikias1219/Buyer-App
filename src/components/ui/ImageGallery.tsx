import { ChevronLeft, ChevronRight, ImageOff, Maximize2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { IconButton } from './IconButton';
import { cn } from './cn';

/** Swipeable gallery (CSS scroll-snap, works with touch and keyboard) + fullscreen viewer. */
export function ImageGallery({ urls, alt }: { urls: string[]; alt: string }) {
  const { t } = useTranslation();
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);

  const scrollTo = (i: number) => {
    const el = track.current;
    if (!el) return;
    const clamped = Math.max(0, Math.min(urls.length - 1, i));
    el.scrollTo({ left: clamped * el.clientWidth, behavior: 'smooth' });
  };

  if (urls.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-surface-2 text-hint">
        <ImageOff aria-hidden className="size-10" />
      </div>
    );
  }

  return (
    <div className="relative bg-black/5" aria-roledescription="carousel" aria-label={alt}>
      <div
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
        }}
        className="no-scrollbar flex aspect-[4/3] snap-x snap-mandatory overflow-x-auto"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') scrollTo(index + 1);
          if (e.key === 'ArrowLeft') scrollTo(index - 1);
        }}
      >
        {urls.map((u, i) => (
          <button
            key={u}
            type="button"
            onClick={() => setFullscreen(true)}
            className="h-full w-full shrink-0 snap-center"
            aria-label={t('gallery.photoOf', { n: i + 1, total: urls.length })}
          >
            <img src={u} alt="" loading={i === 0 ? 'eager' : 'lazy'} decoding="async" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
      {urls.length > 1 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center gap-1.5" aria-hidden>
          {urls.map((u, i) => (
            <span key={u} className={cn('h-1.5 rounded-full bg-white/90 transition-all', i === index ? 'w-4' : 'w-1.5 opacity-60')} />
          ))}
        </div>
      ) : null}
      <IconButton icon={Maximize2} label={t('gallery.fullscreen')} variant="overlay" size="sm" className="absolute bottom-2 right-2" onClick={() => setFullscreen(true)} />
      {fullscreen ? <FullscreenViewer urls={urls} start={index} onClose={() => setFullscreen(false)} /> : null}
    </div>
  );
}

function FullscreenViewer({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [i, setI] = useState(start);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setI((x) => Math.min(urls.length - 1, x + 1));
      if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [urls.length, onClose]);
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('gallery.fullscreen')} className="fixed inset-0 z-[80] flex flex-col bg-black">
      <div className="flex items-center justify-between p-2 text-white" style={{ paddingTop: 'calc(8px + var(--safe-top))' }}>
        <span className="tabular px-2 text-sm">
          {i + 1} / {urls.length}
        </span>
        <IconButton icon={X} label={t('common.close')} variant="overlay" onClick={onClose} autoFocus />
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center">
        <img src={urls[i]} alt="" className="max-h-full max-w-full object-contain" />
        {i > 0 ? (
          <IconButton icon={ChevronLeft} label={t('gallery.previous')} variant="overlay" className="absolute left-2" onClick={() => setI(i - 1)} />
        ) : null}
        {i < urls.length - 1 ? (
          <IconButton icon={ChevronRight} label={t('gallery.next')} variant="overlay" className="absolute right-2" onClick={() => setI(i + 1)} />
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
