import { useId, useState, type ReactNode } from 'react';
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
  suffix?: string;
  placeholder?: string;
  max?: number;
  /** Allowed decimal places (0 = whole numbers). */
  decimals?: number;
  id?: string;
  autoFocus?: boolean;
  size?: 'md' | 'lg';
}

function format(value: number | null, decimals: number): string {
  if (value === null) return '';
  return value.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

/** Numeric input with thousands separators (25,000) and optional decimals (40.50, 1.255 kg). */
export function NumberInput({
  label,
  hint,
  error,
  value,
  onChange,
  onBlur,
  prefix,
  suffix,
  placeholder,
  max = 99_999_999,
  decimals = 0,
  id,
  autoFocus,
  size = 'lg',
}: NumberInputProps) {
  const auto = useId();
  const fid = id ?? auto;
  // Keep the raw text while typing so "12." or "0.0" are not reformatted away.
  const [text, setText] = useState(() => format(value, decimals));
  // Outside value changes (form reset, max clamp) re-sync the text; typing does not.
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    const typed = text === '' ? null : Number(text.replace(/,/g, ''));
    if (typed !== value) setText(format(value, decimals));
  }

  return (
    <FieldShell label={label} hint={hint} error={error} htmlFor={fid}>
      <div className="relative">
        {prefix ? (
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-base font-semibold text-hint">{prefix}</span>
        ) : null}
        <input
          id={fid}
          inputMode={decimals > 0 ? 'decimal' : 'numeric'}
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          onBlur={() => {
            setText(format(value, decimals));
            onBlur?.();
          }}
          onChange={(e) => {
            let raw = e.target.value.replace(/[^\d.]/g, '');
            if (decimals === 0) raw = raw.replace(/\./g, '');
            const [int = '', ...rest] = raw.split('.');
            const frac = rest.join('').slice(0, decimals);
            const intDigits = int.replace(/^0+(?=\d)/, '').slice(0, 9);
            const hasDot = decimals > 0 && raw.includes('.');
            const display = `${intDigits ? Number(intDigits).toLocaleString('en-US') : hasDot ? '0' : ''}${hasDot ? `.${frac}` : ''}`;
            setText(display);
            const n = !intDigits && !frac ? null : Math.min(Number(`${intDigits || '0'}.${frac || '0'}`), max);
            setSynced(n);
            onChange(n);
          }}
          className={cn(controlClass, 'tabular font-semibold', size === 'lg' ? 'text-lg' : 'text-base', prefix && 'pl-14', suffix && 'pr-14')}
        />
        {suffix ? (
          <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-semibold text-hint">{suffix}</span>
        ) : null}
      </div>
    </FieldShell>
  );
}
