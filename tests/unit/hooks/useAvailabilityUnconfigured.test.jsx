import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured.',
  isSupabaseConfigured: false,
  supabase: { rpc: mocks.rpc, channel: mocks.channel, removeChannel: vi.fn() },
  assertSupabase: () => {
    throw new Error('Supabase is not configured.');
  },
}));

import { publishAvailabilityChange, useAvailability } from '../../../src/hooks/useAvailability.js';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useAvailability without Supabase credentials', () => {
  it('reports the missing configuration and never queries', async () => {
    const { result } = renderHook(() => useAvailability('c1', '2026-10-05'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(result.current.isConfigured).toBe(false);
    expect(result.current.live).toBe(false);
    expect(result.current.slotStarts).toBeNull();
    expect(result.current.unavailable.size).toBe(0);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.channel).not.toHaveBeenCalled();
  });

  it('publishAvailabilityChange is a safe no-op', async () => {
    await expect(publishAvailabilityChange('c1', '2026-10-05')).resolves.toBe(false);
    expect(mocks.channel).not.toHaveBeenCalled();
  });
});
