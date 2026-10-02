import { Dumbbell } from 'lucide-react';
import { Alert } from '../ui/Alert.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

const TYPE_LABEL = { indoor: 'Indoor', outdoor: 'Outdoor' };

/**
 * Step 1 — pick a court (spec §3, booking flow step 1).
 * Presentational: data and states come from the page so this stays testable.
 */
export function CourtSelector({
  courts = [],
  selectedId = null,
  onSelect,
  loading = false,
  error = null,
  onRetry,
  isConfigured = true,
}) {
  if (!isConfigured) {
    return (
      <Alert variant="warning" title="Courts unavailable">
        Live court data needs Supabase credentials. Add them to .env.local to browse courts.
      </Alert>
    );
  }

  if (loading) {
    return (
      <div role="status" aria-label="Loading courts" className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" title="Could not load courts">
        <p>{error.message || 'Something went wrong while loading courts.'}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 font-semibold underline underline-offset-2"
          >
            Try again
          </button>
        ) : null}
      </Alert>
    );
  }

  if (courts.length === 0) {
    return (
      <Alert variant="info" title="No courts available">
        No active courts right now — please check back soon.
      </Alert>
    );
  }

  return (
    <div role="radiogroup" aria-label="Choose a court" className="grid gap-3 sm:grid-cols-2">
      {courts.map((court) => {
        const selected = court.id === selectedId;
        return (
          <button
            key={court.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onSelect?.(court)}
            className={[
              'flex items-center gap-3 rounded-xl border p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/40',
              selected
                ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
              <Dumbbell className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold text-slate-900">{court.name}</span>
              <span className="mt-0.5 block text-sm text-slate-500">
                {TYPE_LABEL[court.type] ?? court.type}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
