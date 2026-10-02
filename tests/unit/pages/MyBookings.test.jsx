import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  query: {},
  cancel: {},
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() },
}));

vi.mock('../../../src/hooks/useMyBookings.js', () => ({
  useMyBookings: () => mocks.query,
}));
vi.mock('../../../src/hooks/useBooking.js', () => ({
  useCancelBooking: () => mocks.cancel,
}));
vi.mock('sonner', () => ({ toast: mocks.toast }));

import MyBookings from '../../../src/pages/MyBookings.jsx';

const BOOKING = {
  id: 'b1',
  booking_date: '2026-10-15',
  start_time: '18:00',
  end_time: '19:00',
  status: 'confirmed',
  total_amount: 350,
  customer_name: 'Juan Dela Cruz',
  customer_phone: '09171234567',
  courts: { name: 'Court A' },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <MyBookings />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isConfigured: true,
  };
  mocks.cancel = {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  };
});

describe('MyBookings page', () => {
  it('shows a warning when Supabase is not configured', () => {
    mocks.query.isConfigured = false;
    renderPage();
    expect(screen.getByText(/bookings unavailable/i)).toBeInTheDocument();
  });

  it('shows loading skeletons while fetching', () => {
    mocks.query.isPending = true;
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('offers a retry when loading fails', async () => {
    mocks.query.isError = true;
    mocks.query.error = new Error('network down');
    renderPage();
    expect(screen.getByText(/could not load your bookings/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(mocks.query.refetch).toHaveBeenCalledTimes(1);
  });

  it('shows an empty state with a way back to booking', () => {
    mocks.query.data = [];
    renderPage();
    expect(screen.getByText(/no bookings yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /book a court/i })).toHaveAttribute('href', '/book');
  });

  it('lists bookings with masked phone and formatted values (§7, §19)', () => {
    mocks.query.data = [BOOKING];
    renderPage();
    expect(screen.getByText('Court A')).toBeInTheDocument();
    expect(screen.getByText('confirmed')).toBeInTheDocument();
    expect(screen.getByText(/0917\*\*\*4567/)).toBeInTheDocument();
    expect(screen.getByText('₱350.00')).toBeInTheDocument();
    expect(screen.getByText(/October 15, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/6:00 PM – 7:00 PM/)).toBeInTheDocument();
  });

  it('renders every booking in the list', () => {
    mocks.query.data = [
      BOOKING,
      { ...BOOKING, id: 'b2', status: 'cancelled', courts: { name: 'Court B' } },
    ];
    renderPage();
    expect(screen.getByText('Court A')).toBeInTheDocument();
    expect(screen.getByText('Court B')).toBeInTheDocument();
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });
});

describe('MyBookings cancellation (§7)', () => {
  it('offers cancellation only while a booking can still be cancelled', () => {
    mocks.query.data = [
      { ...BOOKING, id: 'b1', status: 'pending' },
      { ...BOOKING, id: 'b2', status: 'confirmed' },
      { ...BOOKING, id: 'b3', status: 'cancelled' },
      { ...BOOKING, id: 'b4', status: 'completed' },
    ];
    renderPage();
    expect(screen.getAllByRole('button', { name: /^cancel$/i })).toHaveLength(2);
  });

  it('asks for confirmation and then cancels the booking', async () => {
    mocks.query.data = [{ ...BOOKING, status: 'pending' }];
    let callbacks;
    mocks.cancel.mutate = vi.fn((input, cb) => {
      callbacks = cb;
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/slot is released/i)).toBeInTheDocument();
    expect(mocks.cancel.mutate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: /cancel booking/i }));
    expect(mocks.cancel.mutate).toHaveBeenCalledWith({ id: 'b1' }, expect.any(Object));

    await act(async () => {
      callbacks.onSuccess({ id: 'b1' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/cancelled/i));
  });

  it('keeps the dialog open when the cancel request fails', async () => {
    mocks.query.data = [{ ...BOOKING, status: 'pending' }];
    let callbacks;
    mocks.cancel.mutate = vi.fn((input, cb) => {
      callbacks = cb;
    });
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    await userEvent.click(screen.getByRole('button', { name: /cancel booking/i }));

    await act(async () => {
      callbacks.onError(new Error('booking can no longer be cancelled'));
    });

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(mocks.toast.error).toHaveBeenCalledWith(
      expect.stringMatching(/no longer be cancelled/i),
    );
  });

  it('can be dismissed without cancelling', async () => {
    mocks.query.data = [{ ...BOOKING, status: 'pending' }];
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /keep booking/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.cancel.mutate).not.toHaveBeenCalled();
  });

  it('blocks the dialog while the request is in flight', async () => {
    mocks.query.data = [{ ...BOOKING, status: 'pending' }];
    mocks.cancel.isPending = true;
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(screen.getByRole('button', { name: /keep booking/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /cancel booking/i })).toBeDisabled();
  });
});
