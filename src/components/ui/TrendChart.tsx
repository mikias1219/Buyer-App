import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from './cn';

export interface TrendDatum {
  key: string;
  /** Short axis label (e.g. "12 Oct"). */
  label: string;
  value: number;
  /** Tooltip text shown for the bar (formatted). */
  tooltip: string;
}

/**
 * Single-series column chart (one axis, one hue). Negative values hang below a zero baseline.
 * Tap/hover a column to read it; a table view is always available for screen readers and print.
 */
export function TrendChart({ data, title, formatValue }: { data: readonly TrendDatum[]; title: string; formatValue: (n: number) => string }) {
  const { t } = useTranslation();
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const H = 140;
  const max = Math.max(0, ...data.map((d) => d.value));
  const min = Math.min(0, ...data.map((d) => d.value));
  const span = max - min || 1;
  const zeroY = (max / span) * H;
  const n = Math.max(data.length, 1);
  const gap = 2;
  const barW = Math.max(100 / n - gap * (100 / 320), 0.5);
  const labelEvery = Math.ceil(n / 6);
  const current = active !== null ? data[active] : null;

  return (
    <figure className="space-y-2" aria-labelledby={`${id}-t`}>
      <figcaption className="flex items-center justify-between gap-2">
        <span id={`${id}-t`} className="text-sm font-semibold">
          {title}
        </span>
        <button type="button" className="press text-xs font-semibold text-brand" onClick={() => setTable(!table)}>
          {table ? t('charts.showChart') : t('charts.showTable')}
        </button>
      </figcaption>
      {table ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-line">
            {data.map((d) => (
              <tr key={d.key}>
                <th scope="row" className="py-1.5 text-left font-normal text-hint">
                  {d.label}
                </th>
                <td className="tabular py-1.5 text-right font-medium">{formatValue(d.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" onMouseLeave={() => setActive(null)}>
          <p className="tabular h-5 text-xs text-hint" aria-live="polite">
            {current ? current.tooltip : t('charts.tapHint')}
          </p>
          <svg viewBox={`0 0 100 ${H}`} preserveAspectRatio="none" className="h-36 w-full overflow-visible" role="img" aria-label={title}>
            {/* recessive baseline */}
            <line x1="0" x2="100" y1={zeroY} y2={zeroY} stroke="var(--tm-line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {data.map((d, i) => {
              const x = (i * 100) / n + (100 / n - barW) / 2;
              const h = (Math.abs(d.value) / span) * H;
              const y = d.value >= 0 ? zeroY - h : zeroY;
              return (
                <g key={d.key}>
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={Math.max(h, d.value === 0 ? 0 : 1)}
                    rx="0.8"
                    fill={d.value < 0 ? 'var(--tm-danger)' : 'var(--tm-brand)'}
                    opacity={active === null || active === i ? 1 : 0.45}
                  />
                  {/* hit target larger than the mark */}
                  <rect
                    x={(i * 100) / n}
                    y="0"
                    width={100 / n}
                    height={H}
                    fill="transparent"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => setActive(active === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex text-[10px] text-hint" aria-hidden>
            {data.map((d, i) => (
              <span key={d.key} className="flex-1 truncate text-center">
                {i % labelEvery === 0 ? d.label : ''}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  display: string;
  sub?: string;
}

/** Ranked horizontal bars (breakdowns). Labels and values are text, the bar shows magnitude. */
export function BarList({ data, className }: { data: readonly BarDatum[]; className?: string }) {
  const max = Math.max(...data.map((d) => Math.abs(d.value)), 1);
  return (
    <ul className={cn('space-y-2.5', className)}>
      {data.map((d) => (
        <li key={d.key}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate font-medium">{d.label}</span>
            <span className="tabular shrink-0 font-semibold">{d.display}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <div className={cn('h-full rounded-full', d.value < 0 ? 'bg-danger' : 'bg-brand')} style={{ width: `${(Math.abs(d.value) / max) * 100}%` }} />
          </div>
          {d.sub ? <p className="mt-0.5 text-xs text-hint">{d.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}
