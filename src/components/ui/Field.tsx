import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

interface FieldShellProps {
  label?: string;
  hint?: ReactNode;
  error?: string | undefined;
  counter?: { value: number; max: number };
  htmlFor: string;
  children: ReactNode;
  optionalLabel?: string;
}

export function FieldShell({ label, hint, error, counter, htmlFor, children, optionalLabel }: FieldShellProps) {
  return (
    <div className="space-y-1.5">
      {label ? (
        <label htmlFor={htmlFor} className="flex items-baseline justify-between gap-2 text-sm font-semibold text-ink">
          <span>{label}</span>
          {optionalLabel ? <span className="text-xs font-normal text-hint">{optionalLabel}</span> : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : hint || counter ? (
        <div className="flex justify-between gap-2 text-xs text-hint">
          <span id={`${htmlFor}-hint`}>{hint}</span>
          {counter ? (
            <span className={cn('tabular', counter.value > counter.max && 'text-danger')}>
              {counter.value}/{counter.max}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export const controlClass =
  'w-full min-h-11 rounded-input border border-line bg-surface px-3.5 text-base text-ink placeholder:text-hint outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 disabled:opacity-60 aria-[invalid=true]:border-danger';

type Common = { label?: string; hint?: ReactNode; error?: string | undefined; optionalLabel?: string };

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & Common & { leading?: ReactNode }>(
  function Input({ label, hint, error, optionalLabel, leading, id, className, maxLength, value, ...rest }, ref) {
    const auto = useId();
    const fid = id ?? auto;
    const len = typeof value === 'string' ? value.length : 0;
    return (
      <FieldShell
        label={label}
        hint={hint}
        error={error}
        htmlFor={fid}
        optionalLabel={optionalLabel}
        {...(maxLength && maxLength <= 200 && typeof value === 'string' ? { counter: { value: len, max: maxLength } } : {})}
      >
        <div className="relative">
          {leading ? <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-hint">{leading}</span> : null}
          <input
            ref={ref}
            id={fid}
            value={value}
            maxLength={maxLength}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${fid}-error` : hint ? `${fid}-hint` : undefined}
            className={cn(controlClass, Boolean(leading) && 'pl-10', className)}
            {...rest}
          />
        </div>
      </FieldShell>
    );
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & Common>(function Textarea(
  { label, hint, error, optionalLabel, id, className, maxLength, value, rows = 4, ...rest },
  ref,
) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell
      label={label}
      hint={hint}
      error={error}
      htmlFor={fid}
      optionalLabel={optionalLabel}
      {...(maxLength ? { counter: { value: typeof value === 'string' ? value.length : 0, max: maxLength } } : {})}
    >
      <textarea
        ref={ref}
        id={fid}
        rows={rows}
        value={value}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fid}-error` : undefined}
        className={cn(controlClass, 'resize-none py-3 leading-relaxed', className)}
        {...rest}
      />
    </FieldShell>
  );
});

export interface SelectOption {
  value: string;
  label: string;
}

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & Common & { options: readonly SelectOption[]; placeholder?: string }
>(function Select({ label, hint, error, optionalLabel, id, className, options, placeholder, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid} optionalLabel={optionalLabel}>
      <div className="relative">
        <select
          ref={ref}
          id={fid}
          aria-invalid={error ? true : undefined}
          className={cn(controlClass, 'appearance-none pr-10', className)}
          {...rest}
        >
          {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-5 -translate-y-1/2 text-hint" />
      </div>
    </FieldShell>
  );
});
