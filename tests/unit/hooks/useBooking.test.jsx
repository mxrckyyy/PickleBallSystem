import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured.',
  isSupabaseConfigured: true,
  supabase: {
    rpc: mocks.rpc,
    from: mocks.from,
    channel: mocks.channel,
    removeChannel: mocks.removeChannel,
  },
}));

import {
  BookingError,
  isSlotTaken,
  useBooking,
  useCancelBooking,
  useCreateBooking,
} from '../../../src/hooks/useBooking.js';
import { AVAILABILITY_CHANGED, availabilityKey } from '../../../src/hooks/useAvailability.js';

const CREATED = {
  id: 'b1000000-0000-4000-8000-000000000000',
  court_id: 'c1000000-0000-4000-8000-000000000000',
  court_name: 'Court A',
  booking_date: '2026-10-15',
  start_time: '06:00',
  end_time: '07:00',
  status: 'pending',
  total_amount: 200,
};

const INPUT = {
  courtId: CREATED.court_id,
  bookingDate: CREATED.booking_date,
  startTime: CREATED.start_time,
  endTime: CREATED.end_time,
  customer: { name: 'Juan Dela Cruz', phone: '09171234567', email: '' },
  addons: [{ addon_id: 'a1000000-0000-4000-8000-000000000000', quantity: 2 }],
};

let queryClient;
let channel;
let broadcasts;

function createWrapper() {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function createQuery(result) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
  };
  return chain;
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
  mocks.rpc.mockResolvedValue({ data: CREATED, error: null });
  mocks.from.mockReturnValue(createQuery({ data: null, error: null }));
});

describe('useCreateBooking', () => {
  it('sends the validated payload to the create_booking RPC (§5)', async () => {
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).resolves.toEqual(CREATED);

    expect(mocks.rpc).toHaveBeenCalledWith('create_booking', {
      p_court_id: INPUT.courtId,
      p_booking_date: INPUT.bookingDate,
      p_start_time: INPUT.startTime,
      p_end_time: INPUT.endTime,
      p_customer_name: 'Juan Dela Cruz',
      p_customer_phone: '09171234567',
      p_customer_email: null,
      p_addons: INPUT.addons,
    });
  });

  it('refuses an incomplete payload before touching the database', async () => {
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ courtId: 'nope' })).rejects.toMatchObject({
      name: 'BookingError',
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('maps the lost race (23505) to 409 SLOT_TAKEN (§6)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "bookings_slot_uniq"',
      },
    });
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });

    const error = await result.current.mutateAsync(INPUT).catch((caught) => caught);

    expect(error).toBeInstanceOf(BookingError);
    expect(error.code).toBe('SLOT_TAKEN');
    expect(error.message).toMatch(/just taken/i);
    expect(isSlotTaken(error)).toBe(true);
    expect(isSlotTaken(new Error('nope'))).toBe(false);
  });

  it('maps a permission failure to UNAUTHORIZED (§7)', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for function create_booking' },
    });
    const { result } = renderHook(() => useCreateBooking(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync(INPUT)).rejects.toMatchObject({
      code: 'UNAUTHORIZED',
    });
  });

  it('broadcasts the change and invalidates the affected caches', async () => {
    const wrapper = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useCreateBooking(), { wrapper });

    await result.current.mutateAsync(INPUT);
    await waitFor(() => expect(channel.send).toHaveBeenCalled());

    expect(mocks.channel).toHaveBeenCalledWith(`court-${INPUT.courtId}-${INPUT.bookingDate}`);
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: AVAILABILITY_CHANGED,
      payload: { courtId: INPUT.courtId, bookingDate: INPUT.bookingDate },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookings', 'mine'] });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: availabilityKey(INPUT.courtId, INPUT.bookingDate),
    });
  });
});

describe('useBooking', () => {
  it('reads one booking by reference with its court name', async () => {
    const chain = createQuery({ data: CREATED, error: null });
    mocks.from.mockReturnValue(chain);

    const { result } = renderHook(() => useBooking(CREATED.id), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mocks.from).toHaveBeenCalledWith('bookings');
    expect(chain.select).toHaveBeenCalledWith(expect.stringContaining('courts(name)'));
    expect(chain.eq).toHaveBeenCalledWith('id', CREATED.id);
    expect(result.current.data).toEqual(CREATED);
    expect(result.current.isConfigured).toBe(true);
  });

  it('does not query without a reference', async () => {
    const { result } = renderHook(() => useBooking(null), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.fetchStatus).toBe('idle'));
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('useCancelBooking', () => {
  it('sets the booking to cancelled and reopens the slot (§7)', async () => {
    const chain = createQuery({
      data: {
        id: CREATED.id,
        court_id: CREATED.court_id,
        booking_date: CREATED.booking_date,
      },
      error: null,
    });
    mocks.from.mockReturnValue(chain);
    const wrapper = createWrapper();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useCancelBooking(), { wrapper });
    await result.current.mutateAsync({ id: CREATED.id });
    await waitFor(() => expect(channel.send).toHaveBeenCalled());

    expect(chain.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(chain.eq).toHaveBeenCalledWith('id', CREATED.id);
    expect(chain.single).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalledWith({
      type: 'broadcast',
      event: AVAILABILITY_CHANGED,
      payload: { courtId: CREATED.court_id, bookingDate: CREATED.booking_date },
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['bookings', 'mine'] });
    invalidate.mockRestore();
  });

  it('requires a booking reference', async () => {
    const { result } = renderHook(() => useCancelBooking(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({})).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('reports a missing booking as NOT_FOUND', async () => {
    mocks.from.mockReturnValue(
      createQuery({ data: null, error: { code: 'PGRST116', message: 'no rows' } }),
    );
    const { result } = renderHook(() => useCancelBooking(), { wrapper: createWrapper() });

    await expect(result.current.mutateAsync({ id: CREATED.id })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});
