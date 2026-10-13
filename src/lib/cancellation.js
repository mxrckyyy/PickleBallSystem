/**
 * Cancellation policy helpers (spec 6: refund depends on how far in advance.
 *
 *   > 24 h before start      -> 100%
 *   12 h - 24 h before start ->  50%
 *   < 12 h before start      ->   0%
 *   no-show                  ->   0%
 *
 * These helpers only describe eligibility/copy. The actual PayMongo refund is
 * performed server-side in the payment phase.
 */
import { parseISO, isValid } from 'date-fns';

function bookingStartMs(booking) {
  const raw = `${booking?.booking_date ?? ''}T${booking?.start_time ?? '00:00'}`;
  const date = parseISO(raw);
  return isValid(date) ? date.getTime() : NaN;
}

export function hoursUntilStart(booking, now = new Date()) {
  const start = bookingStartMs(booking);
  if (!Number.isFinite(start)) return NaN;
  return (start - now.getTime()) / 3_600_000;
}

export function refundPercentForCancellation(booking, now = new Date()) {
  if (!booking) return 0;
  if (booking.status === 'cancelled' || booking.status === 'completed') return 0;
  // A no-show is modelled as a cancellation initiated after the start time.
  const hours = hoursUntilStart(booking, now);
  if (!Number.isFinite(hours) || hours < 0) return 0;
  if (hours > 24) return 100;
  if (hours >= 12) return 50;
  return 0;
}

export function cancellationPolicyText(percent) {
  if (percent === 100) return 'Full refund (cancelled more than 24 hours ahead).';
  if (percent === 50) return '50% refund (cancelled 12-24 hours ahead).';
  return 'No refund (cancelled less than 12 hours ahead).';
}