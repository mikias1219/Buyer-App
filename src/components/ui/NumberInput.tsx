import { useId, type ReactNode } from 'react';
import { controlClass, FieldShell } from './Field';
import { cn } from './cn';

interface NumberInputProps {
  label?: string;
  hint?: ReactNode;
  error?: string | undefined;
  value: number | null;
  onChange: (value: number | null) => void;
  onBlur?: () => void;
  prefix?: string;
  placeholder?: string;
  max?: number;
  id?: string;
  autoFocus?: boolean;
}

/** Numeric input that shows thousands separators while typing (e.g. 25,000). */
export function NumberInput({ label, hint, error, value, onChange, onBlur, prefix, placeholder, max = 99_999_999, id, autoFocus }: NumberInputProps) {
  const auto = useId();
  const fid = id ?? auto;
  const display = value === null ? '' : value.toLocaleString('en-US');
  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base font-semibold text-hint">{prefix}</span>
        ) : null}
        <input
          id={fid}
          inputMode="numeric"
          autoComplete="off"
          autoFocus={autoFocus}
          value={display}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onBlur={onBlur}
          onChange={(e) => {
            const digits = e.target.value.replace(/\D/g, '').slice(0, 9);
            const n = digits ? Math.min(Number(digits), max) : null;
            onChange(n);
          }}
          className={cn(controlClass, 'tabular text-lg font-semibold', prefix && 'pl-14')}
        />
      </div>
    </FieldShell>
  );
}
