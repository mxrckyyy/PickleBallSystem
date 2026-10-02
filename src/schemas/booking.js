/**
 * Booking creation input schema (spec §6 validation rules).
 *
 * The browser validates here only to fail fast with a readable message; the
 * server re-validates everything in `create_booking` / `bookings_before_insert`
 * and recomputes the price itself — never trust the client (§7).
 */
import { z } from 'zod';
import { BOOKING_RULES } from '../lib/constants.js';
import { isValidPHPhone } from '../lib/format.js';

export const addonLineSchema = z.object({
  addon_id: z.uuid('Choose a valid add-on.'),
  quantity: z
    .int('Quantity must be a whole number.')
    .min(1, 'Add at least one unit.')
    .max(20, 'That is more than we can hold for one booking.'),
});

export const createBookingInputSchema = z.object({
  courtId: z.uuid('Choose a court.'),
  bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a booking date.'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose a start time.'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Choose an end time.'),
  customer: z.object({
    name: z
      .string()
      .trim()
      .min(BOOKING_RULES.minNameLength, 'Enter the name for the booking.')
      .max(BOOKING_RULES.maxNameLength, 'Name must be at most 100 characters.'),
    phone: z
      .string()
      .trim()
      .refine((value) => isValidPHPhone(value), 'Enter a valid mobile number (09XXXXXXXXX).'),
    email: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || z.email().safeParse(value).success,
        'Enter a valid email address.',
      ),
  }),
  addons: z.array(addonLineSchema).default([]),
});
