import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addDays, format } from 'date-fns';

const mocks = vi.hoisted(() => ({
  courts: {},
  addons: {},
  availability: {},
}));

vi.mock('../../../src/hooks/useCourts.js', () => ({
  useCourts: () => mocks.courts,
}));
vi.mock('../../../src/hooks/useAddons.js', () => ({
  useAddons: () => mocks.addons,
}));
vi.mock('../../../src/hooks/useAvailability.js', () => ({
  useAvailability: () => mocks.availability,
}));

import Book from '../../../src/pages/Book.jsx';
import { useBookingStore } from '../../../src/stores/bookingStore.js';

const FUTURE_DATE = format(addDays(new Date(), 3), 'yyyy-MM-dd');

const staticAvailability = () => ({
  isConfigured: false,
  isPending: false,
  isError: false,
  error: null,
  refetch: vi.fn(),
  slotStarts: null,
  slots: null,
  unavailable: new Map(),
  live: false,
});

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
  mocks.availability = staticAvailability();
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

describe('Book page with the availability engine', () => {
  it('renders the slot grid returned by the server and disables taken slots', async () => {
    mocks.availability = {
      ...staticAvailability(),
      isConfigured: true,
      live: true,
      slotStarts: ['06:00', '07:00', '08:00'],
      unavailable: new Map([['07:00', 'booked']]),
    };
    const user = userEvent.setup();
    render(<Book />);

    await user.click(screen.getByRole('radio', { name: /court a/i }));
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });

    expect(
      screen.getByRole('radio', { name: /7:00 am – 8:00 am.*already booked/i }),
    ).toBeDisabled();
    expect(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i })).toBeEnabled();
    expect(screen.queryByRole('radio', { name: /5:00 pm/i })).not.toBeInTheDocument();
    expect(screen.getByText(/refreshes automatically/i)).toBeInTheDocument();
  });

  it('shows a loading state while availability is fetched', async () => {
    mocks.availability = { ...staticAvailability(), isConfigured: true, isPending: true };
    const user = userEvent.setup();
    render(<Book />);

    await user.click(screen.getByRole('radio', { name: /court a/i }));
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });

    expect(screen.getByTestId('slot-grid-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/loading available times/i);
    expect(screen.queryByRole('radio', { name: /6:00 am/i })).not.toBeInTheDocument();
  });

  it('offers a retry when availability cannot be loaded', async () => {
    const refetch = vi.fn();
    mocks.availability = {
      ...staticAvailability(),
      isConfigured: true,
      isError: true,
      error: new Error('boom'),
      refetch,
    };
    const user = userEvent.setup();
    render(<Book />);

    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });

    expect(screen.getByRole('alert')).toHaveTextContent(/couldn't load available times/i);
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('drops a selection the engine reports as no longer available', async () => {
    mocks.availability = {
      ...staticAvailability(),
      isConfigured: true,
      live: true,
      slotStarts: ['06:00', '07:00'],
      unavailable: new Map(),
    };
    const user = userEvent.setup();
    const { rerender } = render(<Book />);

    await user.click(screen.getByRole('radio', { name: /court a/i }));
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });
    await user.click(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i }));
    expect(useBookingStore.getState().startTime).toBe('06:00');

    // Somebody else books the slot while this customer is looking at it.
    mocks.availability = {
      ...mocks.availability,
      unavailable: new Map([['06:00', 'booked']]),
    };
    rerender(<Book />);

    expect(useBookingStore.getState().startTime).toBeNull();
    expect(
      screen.getByRole('radio', { name: /6:00 am – 7:00 am.*already booked/i }),
    ).toBeDisabled();
  });
});
