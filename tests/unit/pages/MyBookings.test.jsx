import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  query: {},
}));

vi.mock('../../../src/hooks/useMyBookings.js', () => ({
  useMyBookings: () => mocks.query,
}));

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
  mocks.query = {
    data: undefined,
    isPending: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    isConfigured: true,
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
