import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured.',
  isSupabaseConfigured: true,
  supabase: { auth: mocks },
  assertSupabase: () => ({ auth: mocks }),
}));

import { AuthProvider, useAuth } from '../../../src/hooks/useAuth.jsx';
import { OTP_RULES } from '../../../src/lib/constants.js';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

/** Awaits a promise that is expected to reject and returns the error. */
async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

async function renderAuth() {
  const rendered = renderHook(() => useAuth(), { wrapper });
  await waitFor(() => expect(rendered.result.current.status).toBe('ready'));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
  mocks.signOut.mockResolvedValue({ error: null });
});

describe('useAuth', () => {
  it('bootstraps from getSession and exposes the session', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1', phone: '+639171234567' } } },
    });

    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('loading');

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user.phone).toBe('+639171234567');
    expect(mocks.onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('tracks session changes pushed by supabase auth', async () => {
    let emit;
    mocks.onAuthStateChange.mockImplementation((callback) => {
      emit = callback;
      return { data: { subscription: { unsubscribe: vi.fn() } } };
    });

    const { result } = await renderAuth();
    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      emit('SIGNED_IN', { user: { id: 'u2', phone: '+639188888888' } });
    });
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      emit('SIGNED_OUT', null);
    });
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('sendOtp normalises the number and sends it as E.164 (§19)', async () => {
    const { result } = await renderAuth();

    await result.current.sendOtp('0917 123 4567');

    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      phone: '+639171234567',
      options: { channel: 'sms' },
    });
  });

  it('sendOtp rejects invalid numbers without calling the API', async () => {
    const { result } = await renderAuth();

    const error = await rejection(result.current.sendOtp('12345'));

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sendOtp rate limits after 3 requests per phone (§7)', async () => {
    const { result } = await renderAuth();

    for (let i = 0; i < OTP_RULES.maxRequestsPerPhone; i += 1) {
      await result.current.sendOtp('09171234567');
    }

    const error = await rejection(result.current.sendOtp('09171234567'));

    expect(error.code).toBe('RATE_LIMITED');
    expect(mocks.signInWithOtp).toHaveBeenCalledTimes(OTP_RULES.maxRequestsPerPhone);
  });

  it('sendOtp shows generic wording on failure (no account enumeration, §7)', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { message: 'User not found' } });
    const { result } = await renderAuth();

    const error = await rejection(result.current.sendOtp('09171234567'));

    expect(error.message).toMatch(/could not send a code/i);
    expect(error.message).not.toMatch(/not found|no account|does not exist/i);
  });

  it('verifyOtp stores the session on success and resets counters', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'u3', phone: '+639171234567' } } },
      error: null,
    });
    const { result } = await renderAuth();
    await result.current.sendOtp('09171234567');

    await act(async () => {
      await result.current.verifyOtp('09171234567', '123456');
    });

    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      phone: '+639171234567',
      token: '123456',
      type: 'sms',
    });
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.otpLimiter.attempts('09171234567')).toBe(0);
  });

  it('verifyOtp rejects malformed codes without calling the API', async () => {
    const { result } = await renderAuth();

    const error = await rejection(result.current.verifyOtp('09171234567', 'abc'));

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('counts wrong codes down to the 5-attempt lockout (§7)', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });
    const { result } = await renderAuth();
    await result.current.sendOtp('09171234567');

    for (let attempt = 1; attempt < OTP_RULES.maxAttempts; attempt += 1) {
      const error = await rejection(result.current.verifyOtp('09171234567', '000000'));
      expect(error.code).toBe('UNAUTHORIZED');
      expect(error.message).toContain(`${OTP_RULES.maxAttempts - attempt} attempt`);
    }

    const locked = await rejection(result.current.verifyOtp('09171234567', '000000'));
    expect(locked.code).toBe('RATE_LIMITED');
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(OTP_RULES.maxAttempts);

    const blocked = await rejection(result.current.verifyOtp('09171234567', '123456'));
    expect(blocked.code).toBe('RATE_LIMITED');
    expect(mocks.verifyOtp).toHaveBeenCalledTimes(OTP_RULES.maxAttempts);
  });

  it('signOut clears the session', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u4', phone: '+639171234567' } } },
    });
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    await act(async () => {
      await result.current.signOut();
    });

    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(result.current.isAuthenticated).toBe(false);
  });
});
