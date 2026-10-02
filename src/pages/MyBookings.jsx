/**
 * My bookings (spec §7: customers read only their own rows — RLS enforces it).
 * Phase 6 adds cancellation: customers may only CANCEL (§7), the BEFORE UPDATE
 * guard rejects anything else, and the freed slot is broadcast to open grids.
 * PII is masked in the UI (§7): phone shown as 0917***4567.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useCancelBooking } from '../hooks/useBooking.js';
import { useMyBookings } from '../hooks/useMyBookings.js';
import { BOOKING_STATUS } from '../lib/constants.js';
import { formatCurrency, formatDate, formatTimeRange, maskPhone } from '../lib/format.js';
import { buttonClasses } from '../lib/ui';
import { Alert } from '../components/ui/Alert.jsx';
import { Button } from '../components/ui/Button.jsx';
import { Modal } from '../components/ui/Modal.jsx';
import { Skeleton } from '../components/ui/Skeleton.jsx';

const STATUS_STYLES = {
  [BOOKING_STATUS.PENDING]: 'bg-amber-100 text-amber-800',
  [BOOKING_STATUS.CONFIRMED]: 'bg-emerald-100 text-emerald-800',
  [BOOKING_STATUS.CANCELLED]: 'bg-slate-200 text-slate-600',
  [BOOKING_STATUS.COMPLETED]: 'bg-blue-100 text-blue-800',
};

const CANCELLABLE = [BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED];

export default function MyBookings() {
  const { data, isPending, isError, error, refetch, isConfigured } = useMyBookings();
  const cancelBooking = useCancelBooking();
  const [cancelTarget, setCancelTarget] = useState(null);

  const closeModal = () => {
    if (!cancelBooking.isPending) setCancelTarget(null);
  };

  function confirmCancel() {
    cancelBooking.mutate(
      { id: cancelTarget?.id },
      {
        onSuccess: () => {
          toast.success('Booking cancelled — the slot is free again.');
          setCancelTarget(null);
        },
        onError: (cancelError) => {
          toast.error(cancelError?.message || 'Could not cancel this booking. Please try again.');
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">My bookings</h1>

      <div className="mt-6">
        {!isConfigured ? (
          <Alert variant="warning" title="Bookings unavailable">
            Supabase is not configured yet, so your bookings cannot be loaded.
          </Alert>
        ) : isPending ? (
          <div role="status" aria-label="Loading bookings" className="space-y-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
        ) : isError ? (
          <Alert variant="danger" title="Could not load your bookings">
            <p>{error?.message || 'Something went wrong.'}</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Try again
            </button>
          </Alert>
        ) : data.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
            <p className="font-medium text-slate-900">No bookings yet</p>
            <p className="max-w-md text-sm text-slate-600">
              Your reservations will appear here once you book a court.
            </p>
            <Link to="/book" className={buttonClasses({ variant: 'primary' })}>
              Book a court
            </Link>
          </div>
        ) : (
          <ul className="space-y-3">
            {data.map((booking) => {
              const courtName = booking.courts?.name ?? 'Court';
              const statusStyle = STATUS_STYLES[booking.status] ?? STATUS_STYLES.pending;
              const canCancel = CANCELLABLE.includes(booking.status);
              return (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{courtName}</p>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${statusStyle}`}
                      >
                        {booking.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatDate(booking.booking_date)} ·{' '}
                      {formatTimeRange(booking.start_time, booking.end_time)}
                    </p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {booking.customer_name} · {maskPhone(booking.customer_phone)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-lg font-bold text-slate-900">
                      {formatCurrency(booking.total_amount)}
                    </p>
                    {canCancel ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCancelTarget(booking)}
                      >
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={closeModal}
        title="Cancel this booking?"
        description="The slot is released immediately for other customers."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={closeModal}
              disabled={cancelBooking.isPending}
            >
              Keep booking
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={cancelBooking.isPending}
              onClick={confirmCancel}
            >
              Cancel booking
            </Button>
          </>
        }
      >
        {cancelTarget ? (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-slate-900">{cancelTarget.courts?.name ?? 'Court'}</p>
            <p className="text-slate-600">
              {formatDate(cancelTarget.booking_date)} ·{' '}
              {formatTimeRange(cancelTarget.start_time, cancelTarget.end_time)}
            </p>
            <p className="text-slate-500">
              This cannot be undone — you would need to book the slot again.
            </p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
