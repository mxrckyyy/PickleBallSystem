/**
 * Booking created (spec §6 lifecycle step 1: `(new) pending`).
 *
 * The slot is now held by the database for 15 minutes (§6 `pendingTtlMinutes`)
 * while the customer pays. Phase 7 adds the PayMongo CTA here; the booking
 * itself, its reference and the pending window are shown from day one.
 *
 * Details come from the navigation state written by the Book page, falling
 * back to an RLS-scoped read of `?ref=` so a refresh still renders.
 */
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useBooking } from '../hooks/useBooking.js';
import { BOOKING_STATUS, BOOKING_RULES } from '../lib/constants.js';
import { formatCurrency, formatDate, formatTimeRange } from '../lib/format.js';
import { buttonClasses } from '../lib/ui';
import { Alert } from '../components/ui/Alert.jsx';
import { Card } from '../components/ui/Card.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

const STATUS_STYLES = {
  [BOOKING_STATUS.PENDING]: 'bg-amber-100 text-amber-800',
  [BOOKING_STATUS.CONFIRMED]: 'bg-emerald-100 text-emerald-800',
  [BOOKING_STATUS.CANCELLED]: 'bg-slate-200 text-slate-600',
  [BOOKING_STATUS.COMPLETED]: 'bg-blue-100 text-blue-800',
};

export default function BookingSuccess() {
  const [params] = useSearchParams();
  const location = useLocation();
  const ref = params.get('ref');
  const stateBooking = location.state?.booking ?? null;

  const { data, isPending, isError, isConfigured } = useBooking(ref);
  const booking = stateBooking ?? data;

  if (!ref && !stateBooking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Alert variant="warning" title="No booking reference">
          <p>We could not find a booking to show. Head back to the booking page to start again.</p>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/book" className={buttonClasses({ variant: 'primary' })}>
            Book a court
          </Link>
          <Link to="/my-bookings" className={buttonClasses({ variant: 'outline' })}>
            My bookings
          </Link>
        </div>
      </div>
    );
  }

  if (!booking && !stateBooking && !isConfigured) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Alert variant="warning" title="Booking unavailable">
          <p>Supabase is not configured yet, so this booking cannot be loaded.</p>
        </Alert>
        <div className="mt-6">
          <Link to="/book" className={buttonClasses({ variant: 'outline' })}>
            Back to booking
          </Link>
        </div>
      </div>
    );
  }

  if (!booking && isPending && !isError) {
    return (
      <div
        className="mx-auto max-w-2xl px-4 py-12 sm:px-6"
        role="status"
        aria-label="Loading booking"
      >
        <Skeleton className="h-8 w-64" />
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
        <Alert variant="danger" title="We couldn't find that booking">
          <p>
            {isError ? 'Something went wrong while loading it. ' : ''}
            Check My bookings for the current status of your reservation.
          </p>
        </Alert>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/my-bookings" className={buttonClasses({ variant: 'primary' })}>
            My bookings
          </Link>
          <Link to="/book" className={buttonClasses({ variant: 'outline' })}>
            Book another court
          </Link>
        </div>
      </div>
    );
  }

  const courtName = booking.court_name ?? booking.courts?.name ?? 'Court';
  const statusStyle = STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending;
  const isPendingStatus = booking.status === BOOKING_STATUS.PENDING;

  const rows = [
    { label: 'Court', value: courtName },
    { label: 'Date', value: formatDate(booking.booking_date) },
    { label: 'Time', value: formatTimeRange(booking.start_time, booking.end_time) },
    { label: 'Total', value: formatCurrency(booking.total_amount) },
  ];

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Booking created</h1>

      <div className="mt-6">
        <Alert variant="success" title="Your slot is reserved">
          <p>
            We are holding <strong>{courtName}</strong> for you on{' '}
            {formatDate(booking.booking_date)},{' '}
            {formatTimeRange(booking.start_time, booking.end_time)}.
          </p>
        </Alert>
      </div>

      <Card className="mt-6" title="Booking details">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyle}`}
          >
            {booking.status}
          </span>
          <span className="text-xs text-slate-500">
            Reference <code className="break-all font-mono">{booking.id ?? ref}</code>
          </span>
        </div>
        <dl className="mt-4 space-y-2 text-sm">
          {rows.map((row) => (
            <div key={row.label} className="flex items-start justify-between gap-3">
              <dt className="text-slate-500">{row.label}</dt>
              <dd className="text-right font-medium text-slate-900">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {isPendingStatus ? (
        <Alert variant="info" title="Complete your payment" className="mt-4">
          <p>
            Your booking stays <strong>pending</strong> for {BOOKING_RULES.pendingTtlMinutes}{' '}
            minutes. Pay within that window to confirm it — after that the slot is released for
            someone else.
          </p>
        </Alert>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-3">
        <Link to="/my-bookings" className={buttonClasses({ variant: 'primary' })}>
          View my bookings
        </Link>
        <Link to="/book" className={buttonClasses({ variant: 'outline' })}>
          Book another court
        </Link>
      </div>
    </div>
  );
}
