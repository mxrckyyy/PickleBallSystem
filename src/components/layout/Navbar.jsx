import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { LogOut, Menu, Target, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../hooks/useAuth.jsx';
import { maskPhone, normalizePhone } from '../../lib/format';
import { buttonClasses } from '../../lib/ui';

const LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/book', label: 'Book a court' },
  { to: '/my-bookings', label: 'My bookings' },
];

function linkClasses({ isActive }) {
  return [
    'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand-50 text-brand-800'
      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  ].join(' ');
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user, signOut } = useAuth();
  const maskedPhone = isAuthenticated && user?.phone ? maskPhone(normalizePhone(user.phone)) : '';

  async function handleSignOut() {
    try {
      await signOut();
      toast.success('Signed out');
    } catch {
      toast.error('Sign out failed. Please try again.');
    }
    setOpen(false);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2" onClick={() => setOpen(false)}>
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
            <Target className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="text-base font-bold tracking-tight text-slate-900">
            Pickleball<span className="text-brand-700"> Book</span>
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={linkClasses}>
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {isAuthenticated ? (
            <>
              <span className="hidden text-sm font-medium text-slate-600 sm:inline">
                {maskedPhone}
              </span>
              <button
                type="button"
                onClick={handleSignOut}
                className={`${buttonClasses({ variant: 'outline', size: 'sm' })} hidden sm:inline-flex`}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`${buttonClasses({ variant: 'primary', size: 'sm' })} hidden sm:inline-flex`}
            >
              Log in
            </Link>
          )}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden"
          >
            {open ? (
              <X className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Menu className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {open ? (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="border-t border-slate-100 bg-white px-4 py-3 md:hidden"
        >
          <ul className="flex flex-col gap-1">
            {LINKS.map((link) => (
              <li key={link.to}>
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) => `${linkClasses({ isActive })} block`}
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </NavLink>
              </li>
            ))}
            <li>
              {isAuthenticated ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className={`${linkClasses({ isActive: false })} flex w-full items-center gap-2`}
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Sign out {maskedPhone}
                </button>
              ) : (
                <NavLink
                  to="/login"
                  className={({ isActive }) => `${linkClasses({ isActive })} block`}
                  onClick={() => setOpen(false)}
                >
                  Log in
                </NavLink>
              )}
            </li>
          </ul>
        </nav>
      ) : null}
    </header>
  );
}
