/**
 * Booking flow helpers (spec §6) — display only.
 *
 * Slot grid, tier lookup and totals computed here are CLIENT-SIDE ESTIMATES.
 * The database re-validates and recomputes the authoritative total server-side
 * on insert (PROJECT_CONTEXT.md J3 / known issue 8). Prices shown follow the
 * §6 pricing tiers.
 */
import { isBefore, parseISO } from 'date-fns';
import { OPERATING_HOURS, PRICING_TIERS, SLOT_DURATION_MINUTES } from './constants.js';

function toMinutes(hhmm) {
  const [hours, minutes] = String(hhmm).split(':').map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(total) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** Hourly start times across operating hours: '06:00' … '21:00' (§6). */
export function buildSlotStarts() {
  const starts = [];
  for (
    let minutes = toMinutes(OPERATING_HOURS.open);
    minutes < toMinutes(OPERATING_HOURS.close);
    minutes += SLOT_DURATION_MINUTES
  ) {
    starts.push(fromMinutes(minutes));
  }
  return starts;
}

/** '21:00' -> '22:00' (one-hour slots, §6). */
export function slotEndFor(startTime) {
  const minutes = toMinutes(startTime);
  if (!Number.isFinite(minutes)) return '';
  return fromMinutes(minutes + SLOT_DURATION_MINUTES);
}

/** PRICING_TIERS entry covering a start time (inclusive from, exclusive to). */
export function tierForStart(startTime) {
  const value = String(startTime ?? '');
  if (!/^\d{2}:\d{2}$/.test(value)) return null;
  return PRICING_TIERS.find((tier) => value >= tier.from && value < tier.to) ?? null;
}

/**
 * True when the slot has already started (no past bookings, §6).
 * Comparison uses device-local wall-clock time; the server re-checks against
 * Asia/Manila before inserting (J15).
 */
export function isSlotPast(bookingDate, startTime, now = new Date()) {
  if (!bookingDate || !startTime) return false;
  const start = parseISO(`${bookingDate}T${startTime}:00`);
  if (Number.isNaN(start.getTime())) return false;
  return isBefore(start, now);
}

/**
 * Client-side price estimate: tier rate for the slot + add-on quantities.
 * Display only — never used for security or final charging (§6, J3).
 */
export function estimateTotal({ startTime, addons = [] } = {}) {
  const tier = tierForStart(startTime);
  const courtRate = tier ? Number(tier.rate) : 0;
  const addonsTotal = addons.reduce(
    (sum, item) => sum + Number(item.price ?? 0) * Number(item.quantity ?? 0),
    0,
  );
  return {
    tier,
    courtRate,
    addonsTotal,
    total: courtRate + addonsTotal,
  };
}
