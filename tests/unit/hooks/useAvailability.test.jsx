import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured.',
  isSupabaseConfigured: true,
  supabase: { rpc: mocks.rpc, channel: mocks.channel, removeChannel: mocks.removeChannel },
  assertSupabase: () => ({ rpc: mocks.rpc }),
}));

import {
  AVAILABILITY_CHANGED,
  availabilityKey,
  publishAvailabilityChange,
  useAvailability,
} from '../../../src/hooks/useAvailability.js';

const AVAILABILITY = {
  court_id: 'c1',
  booking_date: '2026-10-05',
  timezone: 'Asia/Manila',
  open: '06:00',
  close: '22:00',
  slot_minutes: 60,
  slots: [
    { start: '06:00', end: '07:00', tier: 'off_peak', rate: 200, available: true, reason: null },
    {
      start: '07:00',
      end: '08:00',
      tier: 'off_peak',
      rate: 200,
      available: false,
      reason: 'booked',
    },
    { start: '08:00', end: '09:00', tier: 'off_peak', rate: 200, available: true, reason: null },
  ],
};

let channel;
let broadcasts;

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  broadcasts = [];
  channel = {
    on: vi.fn((type, filter, callback) => {
      broadcasts.push({ type, filter, callback });
      return channel;
    }),
    subscribe: vi.fn(() => channel),
    send: vi.fn().mockResolvedValue('ok'),
    unsubscribe: vi.fn(() => 'ok'),
  };
  mocks.channel.mockReturnValue(channel);
  mocks.removeChannel.mockResolvedValue('ok');
  mocks.rpc.mockResolvedValue({ data: AVAILABILITY, error: null });
});

describe('useAvailability', () => {
  it('asks the availability RPC for one court and date', async () => {
    const { result } = renderHook(() => useAvailability('c1', '2026-10-05'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.rpc).toHaveBeenCalledWith('get_availability', {
      p_court_id: 'c1',
      p_booking_date: '2026-10-05',
    });
    expect(result.current.isConfigured).toBe(true);
    expect(result.current.live).toBe(true);
    expect(result.current.slotStarts).toEqual(['06:00', '07:00', '08:00']);
    expect(result.current.unavailable.get('07:00')).toBe('booked');
    expect(result.current.unavailable.has('06:00')).toBe(false);
  });

  it('does not query until both a court and a date are chosen', async () => {
    const { result } = renderHook(() => useAvailability('c1', null), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(result.current.live).toBe(false);
    expect(result.current.slotStarts).toBeNull();
    expect(result.current.unavailable.size).toBe(0);
    expect(availabilityKey('c1', null)).toEqual(['availability', 'c1', null]);
  });

  it('surfaces RPC failures as an error state', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'court not found or inactive' } });

    const { result } = renderHook(() => useAvailability('c1', '2026-10-05'), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error.message).toBe('court not found or inactive');
    expect(result.current.live).toBe(false);
  });

  it('subscribes to the court channel and refetches on a broadcast', async () => {
    const { result } = renderHook(() => useAvailability('c1', '2026-10-05'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.channel).toHaveBeenCalledWith('court-c1-2026-10-05');
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].type).toBe('broadcast');
    expect(broadcasts[0].filter).toEqual({ event: AVAILABILITY_CHANGED });
    expect(channel.subscribe).toHaveBeenCalled();

    mocks.rpc.mockClear();
    broadcasts[0].callback({ payload: { courtId: 'c1', bookingDate: '2026-10-05' } });

    await waitFor(() => expect(mocks.rpc).toHaveBeenCalledTimes(1));
    expect(mocks.rpc).toHaveBeenCalledWith('get_availability', {
      p_court_id: 'c1',
      p_booking_date: '2026-10-05',
    });
  });

  it('leaves the channel when the view unmounts', async () => {
    const { unmount } = renderHook(() => useAvailability('c1', '2026-10-05'), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(channel.subscribe).toHaveBeenCalled());

    unmount();

    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });

  it('does not subscribe without a court and date', async () => {
    renderHook(() => useAvailability(null, null), { wrapper: createWrapper() });

    await waitFor(() => expect(mocks.rpc).not.toHaveBeenCalled());
    expect(mocks.channel).not.toHaveBeenCalled();
  });
});

describe('publishAvailabilityChange', () => {
  it('broadcasts on the court/date channel', async () => {
    await expect(publishAvailabilityChange('c1', '2026-10-05')).resolves.toBe(true);
    expect(mocks.channel).toHaveBeenCalledWith('court-c1-2026-10-05');
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: AVAILABILITY_CHANGED,
      payload: { courtId: 'c1', bookingDate: '2026-10-05' },
    });
  });

  it('reports a rejected broadcast as false', async () => {
    channel.send.mockResolvedValue('error');
    await expect(publishAvailabilityChange('c1', '2026-10-05')).resolves.toBe(false);
  });

  it('does nothing without a court or date', async () => {
    await expect(publishAvailabilityChange(null, '2026-10-05')).resolves.toBe(false);
    await expect(publishAvailabilityChange('c1', null)).resolves.toBe(false);
    expect(mocks.channel).not.toHaveBeenCalled();
  });
});
