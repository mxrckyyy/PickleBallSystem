/**
 * Formatting helpers — spec §19 Localization standards.
 *
 *   Currency    ₱400.00
 *   Phone display 0917 123 4567
 *   Phone storage  09171234567
 *   Phone E.164    +639171234567
 *   Date       January 20, 2025
 *   Time       7:00 AM
 *
 * `booking_date` (date) and `start_time`/`end_time` (time) are stored without
 * timezone information and always represent Philippine wall-clock time, so no
 * conversion is performed when rendering (spec §19).
 */
import { format, isValid, parseISO } from 'date-fns';

const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '₱0.00';
  const formatted = currencyFormatter.format(value).replace(/^[A-Z]{3}\s?/, '');
  return formatted.startsWith('₱') ? formatted : `₱${formatted}`;
}

/** '09171234567' -> '0917 123 4567' */
export function formatPhoneDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!/^09\d{9}$/.test(digits)) return String(value ?? '');
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

/** '09171234567' -> '0917***4567' (spec §7 PII masking). */
export function maskPhone(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length < 10) return '***';
  return `${digits.slice(0, 4)}***${digits.slice(-4)}`;
}

/** 'juan@email.com' -> 'j***@email.com' (spec §7 PII masking). */
export function maskEmail(value) {
  const email = String(value ?? '').trim();
  const at = email.indexOf('@');
  if (at < 1) return '***';
  return `${email[0]}***${email.slice(at)}`;
}

/** Normalises PH input to storage format '09XXXXXXXXX'. */
export function normalizePhone(value) {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('639')) digits = `0${digits.slice(2)}`;
  else if (digits.startsWith('+639')) digits = `0${digits.slice(4)}`;
  else if (digits.startsWith('63')) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isValidPHPhone(value) {
  return /^09\d{9}$/.test(normalizePhone(value));
}

/** Storage format '09171234567' -> E.164 '+639171234567'. */
export function toE164(value) {
  const digits = normalizePhone(value);
  return digits.startsWith('0') ? `+63${digits.slice(1)}` : digits;
}

/** '2025-01-20' | Date -> 'January 20, 2025' */
export function formatDate(value) {
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!date || !isValid(date)) return '';
  return format(date, 'MMMM d, yyyy');
}

/** '2025-01-20' | Date -> 'Tue, Jan 20' (compact picker labels). */
export function formatDateShort(value) {
  const date = typeof value === 'string' ? parseISO(value) : value;
  if (!date || !isValid(date)) return '';
  return format(date, 'EEE, MMM d');
}

/** '19:00' -> '7:00 PM' */
export function formatTime(value) {
  const match = /^(\d{2}):(\d{2})$/.exec(String(value ?? ''));
  if (!match) return String(value ?? '');
  const hour = Number(match[1]);
  const minute = match[2];
  const period = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${minute} ${period}`;
}

/** '07:00' + '08:00' -> '7:00 AM – 8:00 AM' */
export function formatTimeRange(start, end) {
  return `${formatTime(start)} – ${formatTime(end)}`;
}

/** Today's date as 'YYYY-MM-DD' in Philippine wall-clock time. */
export function todayISODate(now = new Date()) {
  return format(now, 'yyyy-MM-dd');
}
