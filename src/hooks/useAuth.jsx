/**
 * Authentication context — phone OTP via Supabase Auth (spec §5 endpoints,
 * §7 security rules).
 *
 *   POST /auth/v1/otp     send OTP        -> signInWithOtp
 *   POST /auth/v1/verify  verify OTP      -> verifyOtp
 *   POST /auth/v1/logout  sign out        -> signOut
 *
 * Rules enforced here:
 *   * access token lives in memory only (supabase.js storage adapter, §7/J12)
 *   * max 5 attempts per OTP, max 3 requests per phone per 15 min (§7) —
 *     client-side pre-enforcement; the server is authoritative
 *   * identical, generic messaging whether or not the phone has an account
 *     (no account enumeration, §7)
 *   * phones normalised to 09XXXXXXXXX for storage, sent as E.164 (§19)
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  SUPABASE_NOT_CONFIGURED_MESSAGE,
  isSupabaseConfigured,
  supabase,
} from '../lib/supabase.js';
import { ERROR_CODES } from '../lib/constants.js';
import { OTP_RESEND_COOLDOWN_SECONDS, createOtpLimiter } from '../lib/authRateLimit.js';
import { isValidPHPhone, normalizePhone, toE164 } from '../lib/format.js';

const GENERIC_SEND_ERROR = 'We could not send a code right now. Please try again in a moment.';
const GENERIC_VERIFY_ERROR = 'That code is not valid. Please check it and try again.';

export class AuthError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(supabase ? 'loading' : 'ready');
  const limiter = useMemo(() => createOtpLimiter(), []);

  useEffect(() => {
    if (!supabase) return undefined;

    let cancelled = false;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!cancelled) {
          setSession(data?.session ?? null);
          setStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('ready');
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!cancelled) setSession(nextSession ?? null);
    });

    return () => {
      cancelled = true;
      subscription?.unsubscribe?.();
    };
  }, []);

  const sendOtp = useCallback(
    async (phone) => {
      const normalized = normalizePhone(phone);
      if (!isValidPHPhone(normalized)) {
        throw new AuthError(
          'Enter a valid mobile number (09XXXXXXXXX).',
          ERROR_CODES.VALIDATION_ERROR,
        );
      }
      if (!supabase) {
        throw new AuthError(SUPABASE_NOT_CONFIGURED_MESSAGE, 'NOT_CONFIGURED');
      }
      if (!limiter.canRequest(normalized)) {
        throw new AuthError(
          `Too many codes requested for this number. Try again in ${limiter.secondsUntilNextRequest(normalized)} seconds.`,
          ERROR_CODES.RATE_LIMITED,
        );
      }

      const { error } = await supabase.auth.signInWithOtp({
        phone: toE164(normalized),
        options: { channel: 'sms' },
      });

      if (error) {
        // Generic on purpose: never reveal whether the number is registered (§7).
        throw new AuthError(GENERIC_SEND_ERROR, ERROR_CODES.SMS_FAILED);
      }

      limiter.recordRequest(normalized);
      return { phone: normalized };
    },
    [limiter],
  );

  const verifyOtp = useCallback(
    async (phone, token) => {
      const normalized = normalizePhone(phone);
      const code = String(token ?? '').trim();

      if (!/^\d{6}$/.test(code)) {
        throw new AuthError('Enter the 6-digit code.', ERROR_CODES.VALIDATION_ERROR);
      }
      if (!supabase) {
        throw new AuthError(SUPABASE_NOT_CONFIGURED_MESSAGE, 'NOT_CONFIGURED');
      }
      if (!limiter.canAttempt(normalized)) {
        throw new AuthError(
          'Too many attempts. Request a new code to continue.',
          ERROR_CODES.RATE_LIMITED,
        );
      }

      const { data, error } = await supabase.auth.verifyOtp({
        phone: toE164(normalized),
        token: code,
        type: 'sms',
      });

      if (error) {
        limiter.recordAttempt(normalized);
        const remaining = limiter.remainingAttempts(normalized);
        if (remaining <= 0) {
          throw new AuthError(
            'Too many attempts. Request a new code to continue.',
            ERROR_CODES.RATE_LIMITED,
          );
        }
        throw new AuthError(
          `${GENERIC_VERIFY_ERROR} ${remaining} attempt${remaining === 1 ? '' : 's'} left.`,
          ERROR_CODES.UNAUTHORIZED,
        );
      }

      limiter.reset(normalized);
      setSession(data?.session ?? null);
      return data;
    },
    [limiter],
  );

  const signOut = useCallback(async () => {
    if (!supabase) {
      setSession(null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new AuthError('Sign out failed. Please try again.', ERROR_CODES.INTERNAL_ERROR);
    }
    setSession(null);
  }, []);

  const value = useMemo(
    () => ({
      status,
      session,
      user: session?.user ?? null,
      isAuthenticated: Boolean(session),
      isConfigured: isSupabaseConfigured,
      otpLimiter: limiter,
      otpResendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      sendOtp,
      verifyOtp,
      signOut,
    }),
    [status, session, limiter, sendOtp, verifyOtp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used inside <AuthProvider>');
  }
  return context;
}
