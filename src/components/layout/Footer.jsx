import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
            <Target className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-900">Pickleball Book</p>
            <p className="text-xs text-slate-500">Court reservations made simple.</p>
          </div>
        </div>

        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
          <Link to="/book" className="hover:text-slate-900">
            Book a court
          </Link>
          <Link to="/my-bookings" className="hover:text-slate-900">
            My bookings
          </Link>
          <Link to="/login" className="hover:text-slate-900">
            Log in
          </Link>
        </nav>

        <p className="text-xs text-slate-500">
          All times shown in Philippine Time (PHT). © {new Date().getFullYear()}
        </p>
      </div>
    </footer>
  );
}
