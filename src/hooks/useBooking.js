/**
 * Booking creation, single-booking reads and cancellation (spec §5 endpoints,
 * §6 race handling, §7 permissions).
 *
 * Creation goes through the `create_booking` RPC instead of two PostgREST
 * writes: the booking row and its add-on lines are committed together, and the
 * database recomputes `total_amount` from the §6 tiers plus the add-on catalog
 * before anything is stored (never trust the client — known issue 8).
 *
 * Race handling (§6): a held slot violates `bookings_slot_uniq`, Postgres
 * answers 23505, and the client maps it to 409 SLOT_TAKEN so the Book page can
 * refetch availability. The database stays the final authority — there is no
 * application-level locking.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TTL, ERROR_CODES } from '../lib/constants.js';
import {
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase.js';
import { createBookingInputSchema } from '../schemas/booking.js';
import { availabilityKey, publishAvailabilityChange } from './useAvailability.js';

export class BookingError extends Error {
  constructor(message, code, cause) {
    super(message);
    this.name = 'BookingError';
    this.code = code;
    if (cause) this.cause = cause;
  }
}

/** True when the failure is the §6 double-booking response (409 SLOT_TAKEN). */
export function isSlotTaken(error) {
  return error?.code === ERROR_CODES.SLOT_TAKEN;
}

/** Translate a PostgREST/Postgres error into the spec §5 error codes. */
function mapError(error) {
  const message = String(error?.message ?? '').trim();

  if (error?.code === '23505' || message.includes('bookings_slot_uniq')) {
    return new BookingError(
      'That time slot was just taken. Pick another one.',
      ERROR_CODES.SLOT_TAKEN,
      error,
    );
  }
  if (error?.code === '42501' || /authentication required/i.test(message)) {
    return new BookingError('Sign in to create a booking.', ERROR_CODES.UNAUTHORIZED, error);
  }
  if (error?.code === 'PGRST116') {
    return new BookingError('That booking could not be found.', ERROR_CODES.NOT_FOUND, error);
  }
  return new BookingError(
    message || 'Something went wrong. Please try again.',
    ERROR_CODES.INTERNAL_ERROR,
    error,
  );
}

function assertConfigured() {
  if (!isSupabaseConfigured) {
    throw new BookingError(SUPABASE_NOT_CONFIGURED_MESSAGE, 'NOT_CONFIGURED');
  }
}

/**
 * Create a booking (court + slot + customer + add-ons) in one round trip.
 * On success the availability grid and "my bookings" caches are refreshed and
 * every open booking screen hears about the change (J19).
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input) => {
      assertConfigured();

      const parsed = createBookingInputSchema.safeParse(input);
      if (!parsed.success) {
        throw new BookingError(
          parsed.error.issues[0]?.message ?? 'Check your booking details.',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      const value = parsed.data;

      const { data, error } = await supabase.rpc('create_booking', {
        p_court_id: value.courtId,
        p_booking_date: value.bookingDate,
        p_start_time: value.startTime,
        p_end_time: value.endTime,
        p_customer_name: value.customer.name,
        p_customer_phone: value.customer.phone,
        p_customer_email: value.customer.email || null,
        p_addons: value.addons,
      });
      if (error) throw mapError(error);
      return data;
    },
    onSuccess: (booking, input) => {
      publishAvailabilityChange(input.courtId, input.bookingDate);
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
      if (input.courtId && input.bookingDate) {
        queryClient.invalidateQueries({
          queryKey: availabilityKey(input.courtId, input.bookingDate),
        });
      }
      return booking;
    },
  });
}

/**
 * One booking by reference — used by /booking/success. RLS decides visibility,
 * so a guest or another customer simply gets `null`.
 */
export function useBooking(bookingId) {
  const enabled = Boolean(isSupabaseConfigured && bookingId);

  const query = useQuery({
    queryKey: ['bookings', 'one', bookingId],
    enabled,
    staleTime: CACHE_TTL.bookings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, court_id, booking_date, start_time, end_time, status, total_amount, courts(name)',
        )
        .eq('id', bookingId)
        .maybeSingle();
      if (error) throw mapError(error);
      return data ?? null;
    },
  });

  return { ...query, isConfigured: isSupabaseConfigured };
}

/**
 * Cancel own booking (§7: customers may only cancel — the BEFORE UPDATE guard
 * rejects anything else and RLS rejects rows they do not own). The freed slot
 * is broadcast so open grids release it immediately (J19).
 */
export function useCancelBooking() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }) => {
      assertConfigured();
      if (!id) {
        throw new BookingError('Booking reference is required.', ERROR_CODES.VALIDATION_ERROR);
      }

      const { data, error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled' })
        .eq('id', id)
        .select('id, court_id, booking_date')
        .single();
      if (error) throw mapError(error);
      return data;
    },
    onSuccess: (row) => {
      publishAvailabilityChange(row?.court_id, row?.booking_date);
      queryClient.invalidateQueries({ queryKey: ['bookings', 'mine'] });
    },
  });
}
