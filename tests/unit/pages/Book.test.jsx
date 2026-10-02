import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router-dom';
import { addDays, format } from 'date-fns';

const mocks = vi.hoisted(() => ({
  courts: {},
  addons: {},
  availability: {},
  auth: {},
  create: {},
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
vi.mock('../../../src/hooks/useAuth.jsx', () => ({
  useAuth: () => mocks.auth,
}));
vi.mock('../../../src/hooks/useBooking.js', () => ({
  useCreateBooking: () => mocks.create,
  isSlotTaken: (error) => error?.code === 'SLOT_TAKEN',
}));

import Book from '../../../src/pages/Book.jsx';
import { useBookingStore } from '../../../src/stores/bookingStore.js';

const FUTURE_DATE = format(addDays(new Date(), 3), 'yyyy-MM-dd');

function SuccessProbe() {
  const [params] = useSearchParams();
  return <div>success page {params.get('ref')}</div>;
}

function bookTree() {
  return (
    <MemoryRouter initialEntries={['/book']}>
      <Routes>
        <Route path="/book" element={<Book />} />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/booking/success" element={<SuccessProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderBook() {
  return render(bookTree());
}

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
  mocks.auth = { isAuthenticated: true };
  mocks.create = {
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
    reset: vi.fn(),
  };
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

async function fillSelection(user, { withAddon = false } = {}) {
  await user.click(screen.getByRole('radio', { name: /court a/i }));
  fireEvent.change(screen.getByLabelText(/booking date/i), {
    target: { value: FUTURE_DATE },
  });
  await user.click(screen.getByRole('radio', { name: /6:00 am – 7:00 am/i }));
  if (withAddon) {
    await user.click(screen.getByRole('checkbox', { name: /paddle/i }));
  }
  await user.type(screen.getByLabelText(/full name/i), 'Juan Dela Cruz');
  await user.type(screen.getByLabelText(/mobile number/i), '09171234567');
  await user.click(screen.getByRole('button', { name: /save details/i }));
  await screen.findByText(/details saved/i);
}

describe('Book page', () => {
  it('keeps checkout disabled until court, slot and details are set', () => {
    renderBook();
    expect(screen.getByRole('button', { name: /continue to payment/i })).toBeDisabled();
  });

  it('explains the court selection until a date is picked', () => {
    renderBook();
    expect(screen.getByText(/pick a date first/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/booking date/i), {
      target: { value: FUTURE_DATE },
    });
    expect(screen.queryByText(/pick a date first/i)).not.toBeInTheDocument();
  });

  it('walks the full selection flow to an enabled, priced summary', async () => {
    const user = userEvent.setup();
    renderBook();

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
    renderBook();

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
    renderBook();

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
    renderBook();

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
    const { rerender } = renderBook();

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
    rerender(bookTree());

    expect(useBookingStore.getState().startTime).toBeNull();
    expect(
      screen.getByRole('radio', { name: /6:00 am – 7:00 am.*already booked/i }),
    ).toBeDisabled();
  });
});

describe('Book page creation (§5, §6, J17)', () => {
  it('sends guests to login and keeps their selection (J17)', async () => {
    mocks.auth = { isAuthenticated: false };
    const user = userEvent.setup();
    renderBook();

    await fillSelection(user, { withAddon: true });
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    expect(await screen.findByText('login page')).toBeInTheDocument();
    expect(mocks.create.mutate).not.toHaveBeenCalled();
    // the Zustand store still holds the selection across the route change
    expect(useBookingStore.getState().startTime).toBe('06:00');
    expect(useBookingStore.getState().addons).toHaveLength(1);
  });

  it('submits the selection and opens the success page with its reference', async () => {
    mocks.create.mutate = vi.fn((input, callbacks) => {
      callbacks.onSuccess({ id: 'b2000000-0000-0000-0000-000000000000', status: 'pending' });
    });
    const user = userEvent.setup();
    renderBook();

    await fillSelection(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    expect(
      await screen.findByText(/success page b2000000-0000-0000-0000-000000000000/),
    ).toBeInTheDocument();
    expect(mocks.create.mutate).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'c1',
        bookingDate: FUTURE_DATE,
        startTime: '06:00',
        endTime: '07:00',
        addons: [],
        customer: expect.objectContaining({ name: 'Juan Dela Cruz', phone: '09171234567' }),
      }),
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    // the form is cleared once the booking exists
    expect(useBookingStore.getState().courtId).toBeNull();
  });

  it('refetches availability when the slot was lost to a race (409 SLOT_TAKEN)', async () => {
    const refetch = vi.fn();
    mocks.availability = { ...staticAvailability(), refetch };
    mocks.create.mutate = vi.fn((input, callbacks) => {
      callbacks.onError({ code: 'SLOT_TAKEN', message: 'That time slot was just taken.' });
    });
    const user = userEvent.setup();
    renderBook();

    await fillSelection(user);
    await user.click(screen.getByRole('button', { name: /continue to payment/i }));

    await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1));
    // a lost race is handled by the grid, not by the generic error panel
    expect(screen.queryByText(/couldn't create your booking/i)).not.toBeInTheDocument();
  });

  it('shows the server message when creation fails for another reason', () => {
    mocks.create = {
      ...mocks.create,
      isError: true,
      error: new Error('court not found or inactive'),
    };
    renderBook();

    expect(screen.getByText(/couldn't create your booking/i)).toBeInTheDocument();
    expect(screen.getByText('court not found or inactive')).toBeInTheDocument();
  });

  it('never shows the generic error panel for a lost race', () => {
    mocks.create = {
      ...mocks.create,
      isError: true,
      error: { code: 'SLOT_TAKEN', message: 'That time slot was just taken.' },
    };
    renderBook();

    expect(screen.queryByText(/couldn't create your booking/i)).not.toBeInTheDocument();
  });

  it('keeps the creation spinner while the slot is being reserved', () => {
    mocks.create = { ...mocks.create, isPending: true };
    renderBook();

    expect(screen.getByRole('button', { name: /reserving your slot/i })).toBeDisabled();
  });
});
