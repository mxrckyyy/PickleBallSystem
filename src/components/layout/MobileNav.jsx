import { NavLink } from 'react-router-dom';
import { CalendarPlus, ClipboardList, Home, UserRound } from 'lucide-react';

const ITEMS = [
  { to: '/', label: 'Home', Icon: Home, end: true },
  { to: '/book', label: 'Book', Icon: CalendarPlus },
  { to: '/my-bookings', label: 'Bookings', Icon: ClipboardList },
  { to: '/login', label: 'Account', Icon: UserRound },
];

/** Bottom tab bar for phones — hidden on md+ where the Navbar links are shown. */
export function MobileNav() {
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="mx-auto flex max-w-6xl">
        {ITEMS.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium',
                  isActive ? 'text-brand-700' : 'text-slate-500 hover:text-slate-800',
                ].join(' ')
              }
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
