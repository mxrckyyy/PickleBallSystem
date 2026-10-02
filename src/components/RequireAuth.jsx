/**
 * Route guard (spec §7 permission matrix — guests cannot view their bookings).
 * Unauthenticated visitors are sent to /login with a `next` parameter so they
 * land back where they were after verifying their phone.
 */
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { Skeleton } from './ui/Skeleton.jsx';

export function RequireAuth({ children }) {
  const { status, isAuthenticated } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div
        role="status"
        aria-label="Checking your session"
        className="mx-auto max-w-6xl px-4 py-12 sm:px-6"
      >
        <Skeleton className="h-8 w-56" />
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    const next = `${location.pathname}${location.search}`;
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return children;
}
