import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured. Add VITE_SUPABASE_URL.',
  isSupabaseConfigured: false,
  supabase: null,
  assertSupabase: () => {
    throw new Error('Supabase is not configured.');
  },
}));

import { AuthProvider, useAuth } from '../../../src/hooks/useAuth.jsx';

const wrapper = ({ children }) => <AuthProvider>{children}</AuthProvider>;

async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAuth without Supabase credentials', () => {
  it('is ready immediately with no session', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe('ready');
    expect(result.current.isConfigured).toBe(false);
    expect(result.current.isAuthenticated).toBe(false);
    await waitFor(() => expect(mocks.getSession).not.toHaveBeenCalled());
  });

  it('rejects sendOtp and verifyOtp with a clear configuration error', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    const sendError = await rejection(result.current.sendOtp('09171234567'));
    expect(sendError.code).toBe('NOT_CONFIGURED');
    expect(sendError.message).toMatch(/not configured/i);

    const verifyError = await rejection(result.current.verifyOtp('09171234567', '123456'));
    expect(verifyError.code).toBe('NOT_CONFIGURED');

    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it('signOut still resolves locally', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await expect(result.current.signOut()).resolves.toBeUndefined();
    expect(result.current.isAuthenticated).toBe(false);
  });
});
