import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  query: {},
}));

vi.mock('../../../src/hooks/useBooking.js', () => ({
  useBooking: () => mocks.query,
}));

import BookingSuccess from '../../../src/pages/BookingSuccess.jsx';

const BOOKING = {
  id: 'b1000000-0000-0000-0000-000000000000',
  court_name: 'Court A',
  booking_date: '2026-10-15',
  start_time: '18:00',
  end_time: '19:00',
  status: 'pending',
  total_amount: 350,
};

function renderPage({ path = '/booking/success?ref=b1', state } = {}) {
  const [pathname, search = ''] = path.split('?');
  const entry =
    state === undefined ? path : { pathname, search: search ? `?${search}` : '', state };

  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/booking/success" element={<BookingSuccess />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query = {
    data: null,
    isPending: false,
    isError: false,
    isConfigured: true,
    refetch: vi.fn(),
  };
});

describe('BookingSuccess page', () => {
  it('sends people without a reference back to booking', () => {
    renderPage({ path: '/booking/success' });

    expect(screen.getByText(/no booking reference/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /book a court/i })).toHaveAttribute('href', '/book');
    expect(screen.getByRole('link', { name: /my bookings/i })).toHaveAttribute(
      'href',
      '/my-bookings',
    );
  });

  it('warns when Supabase is not configured', () => {
    mocks.query.isConfigured = false;
    renderPage();

    expect(screen.getByText(/booking unavailable/i)).toBeInTheDocument();
  });

  it('shows a loading skeleton while the reference is fetched', () => {
    mocks.query.isPending = true;
    renderPage();

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByLabelText(/loading booking/i)).toBeInTheDocument();
  });

  it('explains when the reference cannot be found', () => {
    renderPage();

    expect(screen.getByText(/couldn't find that booking/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my bookings/i })).toBeInTheDocument();
  });

  it('renders the booking handed over by the booking flow immediately', () => {
    mocks.query.isPending = true;
    renderPage({ state: { booking: BOOKING } });

    expect(screen.getByText(/booking created/i)).toBeInTheDocument();
    expect(screen.getAllByText('Court A').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/October 15, 2026/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/6:00 PM – 7:00 PM/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('₱350.00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
    expect(screen.getByText(new RegExp(BOOKING.id))).toBeInTheDocument();
  });

  it('shows the pending payment window from the spec (§6)', () => {
    mocks.query.data = BOOKING;
    renderPage();

    expect(screen.getByText(/complete your payment/i)).toBeInTheDocument();
    expect(screen.getByText(/15 minutes/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view my bookings/i })).toHaveAttribute(
      'href',
      '/my-bookings',
    );
    expect(screen.getByRole('link', { name: /book another court/i })).toHaveAttribute(
      'href',
      '/book',
    );
  });

  it('hides the payment prompt once the booking is confirmed', () => {
    mocks.query.data = { ...BOOKING, status: 'confirmed' };
    renderPage();

    expect(screen.getAllByText('confirmed').length).toBeGreaterThan(0);
    expect(screen.queryByText(/complete your payment/i)).not.toBeInTheDocument();
  });

  it('falls back to the court name embedded in the booking', () => {
    mocks.query.data = { ...BOOKING, court_name: undefined, courts: { name: 'Court B' } };
    renderPage();

    expect(screen.getAllByText('Court B').length).toBeGreaterThan(0);
  });
});
