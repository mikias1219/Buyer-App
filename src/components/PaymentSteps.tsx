const STEPS = [
  { n: 1, title: 'Create listing', desc: 'Fill product details' },
  { n: 2, title: 'Pay fee', desc: 'Send Telebirr listing fee' },
  { n: 3, title: 'Go live', desc: 'Admin confirms → buyers see contact' },
] as const;

export function PaymentSteps({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol className="grid grid-cols-3 gap-1.5">
      {STEPS.map((step) => {
        const done = step.n < current;
        const active = step.n === current;
        return (
          <li
            key={step.n}
            className={[
              'rounded-2xl px-2 py-2.5 text-center',
              active
                ? 'bg-[var(--tg-theme-button-color,#2481cc)] text-white'
                : done
                  ? 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-200'
                  : 'bg-[var(--tg-theme-bg-color,#efeff4)] text-[var(--tg-theme-hint-color,#8e8e93)]',
            ].join(' ')}
          >
            <p className="text-[11px] font-bold">Step {step.n}</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-tight">{step.title}</p>
            <p
              className={[
                'mt-0.5 text-[10px] leading-tight',
                active ? 'text-white/85' : '',
              ].join(' ')}
            >
              {step.desc}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
