/**
 * Client-side OTP request/attempt bookkeeping (spec §7 OTP Security).
 *
 *   Max 3 OTP requests per phone per 15 minutes
 *   Max 5 attempts per OTP
 *
 * This is UX sugar only: the real enforcement lives on the server. The
 * counters are held in memory (tokens and abuse state are never persisted to
 * storage), so a reload clears them — acceptable because the server still
 * enforces the same limits.
 *
 * `now` is injectable so tests can advance time without fake timers.
 */
import { OTP_RULES } from './constants.js';

/** UI-only cooldown between "Send code" presses (not a spec number). */
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

export function createOtpLimiter({
  now = () => Date.now(),
  maxRequests = OTP_RULES.maxRequestsPerPhone,
  windowMs = OTP_RULES.windowMinutes * 60 * 1000,
  maxAttempts = OTP_RULES.maxAttempts,
} = {}) {
  const entries = new Map();

  function entry(phone) {
    const key = String(phone ?? '');
    let value = entries.get(key);
    if (!value) {
      value = { requests: [], attempts: 0 };
      entries.set(key, value);
    }
    return value;
  }

  function prune(value) {
    const cutoff = now() - windowMs;
    while (value.requests.length > 0 && value.requests[0] <= cutoff) {
      value.requests.shift();
    }
  }

  return {
    canRequest(phone) {
      const value = entry(phone);
      prune(value);
      return value.requests.length < maxRequests;
    },
    /** Records a *successful* send; a new code also restarts attempt counting. */
    recordRequest(phone) {
      const value = entry(phone);
      prune(value);
      value.requests.push(now());
      value.attempts = 0;
    },
    /** Seconds until another request is allowed (0 = allowed now). */
    secondsUntilNextRequest(phone) {
      const value = entry(phone);
      prune(value);
      if (value.requests.length < maxRequests) return 0;
      const oldest = value.requests[0];
      return Math.max(0, Math.ceil((oldest + windowMs - now()) / 1000));
    },
    canAttempt(phone) {
      return entry(phone).attempts < maxAttempts;
    },
    recordAttempt(phone) {
      entry(phone).attempts += 1;
    },
    attempts(phone) {
      return entry(phone).attempts;
    },
    remainingAttempts(phone) {
      return Math.max(0, maxAttempts - entry(phone).attempts);
    },
    /** Call after a successful verification. */
    reset(phone) {
      entries.delete(String(phone ?? ''));
    },
  };
}
