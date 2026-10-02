/**
 * Business constants — single client-side source for the values documented in
 * Developers.pdf. The database enforces the same rules server-side; these are
 * used for pre-validation and display only (never for security decisions).
 */

/** Spec §6 pricing tiers (authoritative — see PROJECT_CONTEXT.md J3). */
export const PRICING_TIERS = [
  { tier: 'off_peak', label: 'Off-peak', from: '06:00', to: '12:00', rate: 200 },
  { tier: 'standard', label: 'Standard', from: '12:00', to: '18:00', rate: 250 },
  { tier: 'peak', label: 'Peak', from: '18:00', to: '22:00', rate: 350 },
];

/** Spec §6 — operating hours (site-level default, see PROJECT_CONTEXT.md J4). */
export const OPERATING_HOURS = { open: '06:00', close: '22:00' };

/** Spec §6 — hourly bookable grid. */
export const SLOT_DURATION_MINUTES = 60;

/** Spec §6 booking validation rules. */
export const BOOKING_RULES = {
  maxAdvanceDays: 30,
  pendingTtlMinutes: 15,
  minNameLength: 2,
  maxNameLength: 100,
  phonePattern: /^09\d{9}$/,
};

/** Spec §7 OTP security limits. */
export const OTP_RULES = {
  maxAttempts: 5,
  ttlMinutes: 5,
  maxRequestsPerPhone: 3,
  windowMinutes: 15,
};

/** Spec §6 — booking status lifecycle. */
export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
});

/** Spec §5 — API error codes returned to the client. */
export const ERROR_CODES = Object.freeze({
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  SLOT_TAKEN: 'SLOT_TAKEN',
  BOOKING_EXPIRED: 'BOOKING_EXPIRED',
  RATE_LIMITED: 'RATE_LIMITED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  SMS_FAILED: 'SMS_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
});

/** Spec §7 — rate limits (enforcement tier TBD, see PROJECT_CONTEXT.md J13). */
export const RATE_LIMITS = Object.freeze({
  otpSendPerMinutePerIp: 5,
  bookingCreatePerMinutePerUser: 10,
  availabilityPerMinutePerIp: 60,
  webhookPerMinutePerIp: 100,
  adminPerMinutePerUser: 30,
});

/** Spec §12 — TanStack Query caching tiers. */
export const CACHE_TTL = Object.freeze({
  courts: 5 * 60 * 1000,
  availability: 30 * 1000,
  bookings: 60 * 1000,
});

/** Spec §19 — display timezone for every date/time shown in the UI. */
export const TIMEZONE_LABEL = 'Philippine Time (PHT)';

/** Spec §5 — realtime channel naming. */
export const REALTIME_CHANNELS = Object.freeze({
  courtAvailability: (courtId, date) => `court-${courtId}-${date}`,
  userBookings: (userId) => `bookings-user-${userId}`,
});
