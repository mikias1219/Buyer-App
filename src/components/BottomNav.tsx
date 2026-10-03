import { NavLink } from 'react-router-dom';

const LINKS = [
  {
    to: '/',
    label: 'Browse',
    end: true,
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h10" />
      </svg>
    ),
  },
  {
    to: '/add',
    label: 'Sell',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
      </svg>
    ),
  },
  {
    to: '/my-listings',
    label: 'Mine',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Zm4 0V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (
      <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.9">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5Z"
        />
      </svg>
    ),
  },
] as const;

export function BottomNav() {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-[var(--tg-theme-secondary-bg-color,#ffffff)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-white/10"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {LINKS.map((link) => (
          <li key={link.to} className="flex-1">
            <NavLink
              to={link.to}
              end={'end' in link ? link.end : false}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-0.5 px-1 py-2.5 text-[11px] font-semibold transition-colors',
                  isActive
                    ? 'text-[var(--tg-theme-button-color,#2481cc)]'
                    : 'text-[var(--tg-theme-hint-color,#8e8e93)]',
                ].join(' ')
              }
            >
              {link.icon}
              <span>{link.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
