import { formatTimeRange } from '../../lib/format.js';
import { isSlotPast, slotEndFor } from '../../lib/booking.js';
import { Skeleton } from '../ui/Skeleton.jsx';

const REASON_COPY = {
  booked: 'Already booked',
  past: 'Already started',
};

/**
 * Step 2b — hourly slot grid (spec §3 / §6: 06:00–22:00, one-hour slots).
 *
 * `unavailable` is a Map of start time -> 'booked' | 'past' produced by the
 * availability engine (Phase 5). Slots in that map are disabled and labelled
 * for assistive technology. Without it (Supabase not configured) the component
 * falls back to the static grid with the client-side past check — the server
 * re-checks everything on insert (§6).
 */
export function TimeSlotGrid({
  bookingDate = '',
  slots = [],
  selectedStart = null,
  onSelect,
  disabled = false,
  unavailable = null,
  loading = false,
  live = false,
}) {
  if (!bookingDate) {
    return <p className="text-sm text-slate-500">Pick a date first to see available times.</p>;
  }

  if (loading) {
    return (
      <div>
        <div
          className="grid grid-cols-2 gap-2 sm:grid-cols-4"
          aria-hidden="true"
          data-testid="slot-grid-loading"
        >
          {Array.from({ length: 8 }, (_, index) => (
            <Skeleton key={index} className="h-10" />
          ))}
        </div>
        <p role="status" className="mt-2 text-xs text-slate-500">
          Loading available times…
        </p>
      </div>
    );
  }

  return (
    <div>
      <div
        role="radiogroup"
        aria-label="Choose a time slot"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {slots.map((start) => {
          const end = slotEndFor(start);
          const reason =
            unavailable?.get(start) ?? (isSlotPast(bookingDate, start) ? 'past' : null);
          const unavailableNow = disabled || Boolean(reason);
          const selected = start === selectedStart;
          return (
            <button
              key={start}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={unavailableNow}
              title={reason ? REASON_COPY[reason] : undefined}
              onClick={() => onSelect?.(start)}
              className={[
                'rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/40',
                selected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50',
                unavailableNow
                  ? 'cursor-not-allowed bg-slate-50 text-slate-400 hover:bg-slate-50'
                  : '',
              ].join(' ')}
            >
              {formatTimeRange(start, end)}
              {reason ? <span className="sr-only"> ({REASON_COPY[reason]})</span> : null}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {live
          ? 'Greyed-out times are already booked or have started. Availability refreshes automatically.'
          : 'Slots shown are the full operating grid. Live availability is confirmed when you book.'}
      </p>
    </div>
  );
}
