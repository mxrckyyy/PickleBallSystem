import { describe, expect, it } from 'vitest';
import { OTP_RESEND_COOLDOWN_SECONDS, createOtpLimiter } from '../../../src/lib/authRateLimit.js';
import { OTP_RULES } from '../../../src/lib/constants.js';

const PHONE = '09171234567';
const WINDOW_MS = OTP_RULES.windowMinutes * 60 * 1000;

describe('createOtpLimiter', () => {
  it('allows at most 3 OTP requests per phone per 15 minutes (§7)', () => {
    let clock = 1_000_000;
    const limiter = createOtpLimiter({ now: () => clock });

    for (let i = 0; i < OTP_RULES.maxRequestsPerPhone; i += 1) {
      expect(limiter.canRequest(PHONE)).toBe(true);
      limiter.recordRequest(PHONE);
    }

    expect(limiter.canRequest(PHONE)).toBe(false);
    expect(limiter.secondsUntilNextRequest(PHONE)).toBeGreaterThan(0);

    clock += WINDOW_MS + 1;
    expect(limiter.canRequest(PHONE)).toBe(true);
    expect(limiter.secondsUntilNextRequest(PHONE)).toBe(0);
  });

  it('keeps counters isolated per phone number', () => {
    const limiter = createOtpLimiter();
    limiter.recordRequest(PHONE);
    limiter.recordRequest(PHONE);
    limiter.recordRequest(PHONE);

    expect(limiter.canRequest(PHONE)).toBe(false);
    expect(limiter.canRequest('09189999999')).toBe(true);
  });

  it('locks after 5 attempts on one code (§7)', () => {
    const limiter = createOtpLimiter();

    for (let i = 0; i < OTP_RULES.maxAttempts; i += 1) {
      expect(limiter.canAttempt(PHONE)).toBe(true);
      limiter.recordAttempt(PHONE);
    }

    expect(limiter.canAttempt(PHONE)).toBe(false);
    expect(limiter.remainingAttempts(PHONE)).toBe(0);
    expect(limiter.attempts(PHONE)).toBe(OTP_RULES.maxAttempts);
  });

  it('a new code restarts the attempt counter', () => {
    const limiter = createOtpLimiter();
    limiter.recordAttempt(PHONE);
    limiter.recordAttempt(PHONE);
    expect(limiter.remainingAttempts(PHONE)).toBe(OTP_RULES.maxAttempts - 2);

    limiter.recordRequest(PHONE);
    expect(limiter.remainingAttempts(PHONE)).toBe(OTP_RULES.maxAttempts);
  });

  it('reset() clears a phone after a successful verification', () => {
    const limiter = createOtpLimiter();
    limiter.recordRequest(PHONE);
    limiter.recordAttempt(PHONE);
    limiter.reset(PHONE);

    expect(limiter.attempts(PHONE)).toBe(0);
    expect(limiter.canRequest(PHONE)).toBe(true);
  });

  it('exposes the UI resend cooldown (60s)', () => {
    expect(OTP_RESEND_COOLDOWN_SECONDS).toBe(60);
  });
});
