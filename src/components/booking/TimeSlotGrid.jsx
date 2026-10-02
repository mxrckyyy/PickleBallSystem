import { formatTimeRange } from '../../lib/format.js';
import { isSlotPast, slotEndFor } from '../../lib/booking.js';

/**
 * Step 2b — hourly slot grid (spec §3 / §6: 06:00–22:00, one-hour slots).
 *
 * Phase 4 renders the full operating grid; live availability (already-taken
 * slots) arrives with the availability engine (Phase 5). Past slots for the
 * selected date are disabled client-side — the server re-checks (§6).
 */
export function TimeSlotGrid({
  bookingDate = '',
  slots = [],
  selectedStart = null,
  onSelect,
  disabled = false,
}) {
  if (!bookingDate) {
    return <p className="text-sm text-slate-500">Pick a date first to see available times.</p>;
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
          const past = isSlotPast(bookingDate, start);
          const unavailable = disabled || past;
          const selected = start === selectedStart;
          return (
            <button
              key={start}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={unavailable}
              onClick={() => onSelect?.(start)}
              className={[
                'rounded-lg border px-2 py-2.5 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-brand-600/40',
                selected
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-brand-300 hover:bg-brand-50',
                unavailable
                  ? 'cursor-not-allowed bg-slate-50 text-slate-400 hover:bg-slate-50'
                  : '',
              ].join(' ')}
            >
              {formatTimeRange(start, end)}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Slots shown are the full operating grid. Live availability is confirmed when you book.
      </p>
    </div>
  );
}
