import { CheckCircle2, Info, XCircle } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { haptic } from '../../lib/telegram';
import { cn } from './cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(tone: ToastTone, message: string, ms = 3200) {
  const id = nextId++;
  items = [...items.slice(-2), { id, tone, message }];
  emit();
  if (tone === 'success') haptic.notify('success');
  if (tone === 'error') haptic.notify('error');
  setTimeout(() => {
    items = items.filter((t) => t.id !== id);
    emit();
  }, ms);
}

export const toast = {
  success: (m: string) => push('success', m),
  error: (m: string) => push('error', m, 4500),
  info: (m: string) => push('info', m),
};

const ICONS = { success: CheckCircle2, error: XCircle, info: Info };

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => items,
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 z-[70] flex flex-col items-center gap-2 px-4"
      style={{ bottom: 'calc(88px + var(--safe-bottom))' }}
    >
      {list.map((t) => {
        const Icon = ICONS[t.tone];
        return (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-2.5 rounded-input px-4 py-3 text-sm font-medium shadow-sheet [animation:tm-toast-in_200ms_ease]',
              'bg-[#1f2937] text-white dark:bg-[#e5e7eb] dark:text-[#111418]',
            )}
          >
            <Icon aria-hidden className={cn('mt-px size-5 shrink-0', t.tone === 'success' && 'text-[#4ade80]', t.tone === 'error' && 'text-[#f87171]')} />
            <span>{t.message}</span>
          </div>
        );
      })}
    </div>
  );
}
