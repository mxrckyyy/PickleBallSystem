import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format } from 'date-fns';

const mocks = vi.hoisted(() => ({
  courts: {},
  addons: {},
}));

vi.mock('../../../src/hooks/useCourts.js', () => ({
  useCourts: () => mocks.courts,
}));
vi.mock('../../../src/hooks/useAddons.js', () => ({
  useAddons: () => mocks.addons,
}));

import Book from '../../../src/pages/Book.jsx';
import { useBookingStore } from '../../../src/stores/bookingStore.js';

const FUTURE_DATE = format(addDays(new Date(), 3), 'yyyy-MM-dd');

beforeEach(() => {
  useBookingStore.getState().reset();
  mocks.courts = {
    data: [
      { id: 'c1', name: 'Court A', type: 'indoor' },
      { id: 'c2', name: 'Court B', type: 'outdoor' },
    ],
    isPending: false,
    isError: false,
    error: null,
    isConfigured: true,
    refetch: vi.fn(),
  };
  mocks.addons = {
    data: [{ id: 'a1', name: 'Paddle', price: 100 }],
    isPending: false,
    isError: false,
    error: null,
    isConfigured: true,
    refetch: vi.fn(),
  };
});

describe('Book page', () => {
  it('keeps checkout disabled until court, slot and details are set', () => {
    render(<Book />);
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeDisabled();
  });

  it('explains the court selection until a date is picked', () => {
    render(<Book />);
    expect(screen.getByText(/pick a date first/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });
    expect(screen.queryByText(/pick a date first/i)).not.toBeInTheDocument();
  });

  it('walks the full selection flow to an enabled, priced summary', async () => {
    const user = userEvent.setup();
    render(<Book />);

    await user.click(screen.getByRole('radio', { name: /court a/i }));
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });
    await user.click(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i }));

    await user.click(screen.getByRole('checkbox', { name: /paddle/i }));
    expect(screen.getByText(/paddle × 1/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/full name/i), 'Juan Dela Cruz');
    await user.type(screen.getByLabelText(/mobile number/i), '09171234567');
    await user.click(screen.getByRole('button', { name: /save details/i }));

    expect(await screen.findByText(/details saved/i)).toBeInTheDocument();

    // off-peak ₱200 + paddle ₱100
    expect(screen.getByText('₱300.00')).toBeInTheDocument();
    expect(screen.getAllByText('Court A').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeEnabled();
  });
});
