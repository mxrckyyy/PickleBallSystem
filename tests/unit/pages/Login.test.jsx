import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../../../src/lib/supabase.js', () => ({
  SUPABASE_NOT_CONFIGURED_MESSAGE: 'Supabase is not configured.',
  isSupabaseConfigured: true,
  supabase: { auth: mocks },
  assertSupabase: () => ({ auth: mocks }),
}));

import { AuthProvider } from '../../../src/hooks/useAuth.jsx';
import Login from '../../../src/pages/Login.jsx';

async function renderLogin(initialEntry = '/login?next=%2Fmy-bookings', { showForm = true } = {}) {
  const view = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/my-bookings" element={<p>my bookings page</p>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
  // Login renders nothing until the session bootstrap finishes (an already
  // signed-in visitor is redirected straight to the target page instead).
  if (showForm) {
    await screen.findByRole('heading', { name: 'Log in' });
  }
  return view;
}

async function requestCode(phone) {
  await userEvent.type(screen.getByLabelText(/mobile number/i), phone);
  await userEvent.click(screen.getByRole('button', { name: /send code/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
  mocks.signInWithOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: null });
});

describe('Login page', () => {
  it('validates the mobile number before calling the API', async () => {
    await renderLogin();

    await userEvent.type(screen.getByLabelText(/mobile number/i), '123');
    await userEvent.click(screen.getByRole('button', { name: /send code/i }));

    expect(await screen.findByText(/enter a valid mobile number/i)).toBeInTheDocument();
    expect(mocks.signInWithOtp).not.toHaveBeenCalled();
  });

  it('sends the code as E.164 and moves to the code step', async () => {
    await renderLogin();
    await requestCode('09171234567');

    expect(await screen.findByLabelText(/one-time code/i)).toBeInTheDocument();
    expect(mocks.signInWithOtp).toHaveBeenCalledWith({
      phone: '+639171234567',
      options: { channel: 'sms' },
    });
    expect(screen.getByText('0917***4567')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /change number/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /resend/i })).toBeDisabled();
  });

  it('shows generic error copy when the code cannot be sent', async () => {
    mocks.signInWithOtp.mockResolvedValue({ error: { message: 'User not found' } });
    await renderLogin();
    await requestCode('09171234567');

    expect(await screen.findByText(/could not send a code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/mobile number/i)).toBeInTheDocument();
  });

  it('verifies the code and lands on the requested page', async () => {
    mocks.verifyOtp.mockResolvedValue({
      data: { session: { user: { id: 'u1', phone: '+639171234567' } } },
      error: null,
    });
    await renderLogin();
    await requestCode('09171234567');
    await userEvent.type(await screen.findByLabelText(/one-time code/i), '123456');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByText('my bookings page')).toBeInTheDocument();
    expect(mocks.verifyOtp).toHaveBeenCalledWith({
      phone: '+639171234567',
      token: '123456',
      type: 'sms',
    });
  });

  it('keeps the user on the code step when the code is wrong', async () => {
    mocks.verifyOtp.mockResolvedValue({ data: { session: null }, error: { message: 'bad' } });
    await renderLogin();
    await requestCode('09171234567');
    await userEvent.type(await screen.findByLabelText(/one-time code/i), '999999');
    await userEvent.click(screen.getByRole('button', { name: /verify code/i }));

    expect(await screen.findByText(/not valid/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/one-time code/i)).toBeInTheDocument();
    expect(screen.queryByText('my bookings page')).not.toBeInTheDocument();
  });

  it('redirects an already signed-in visitor to the requested page', async () => {
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u2', phone: '+639171234567' } } },
    });
    await renderLogin('/login?next=%2Fmy-bookings', { showForm: false });

    expect(await screen.findByText('my bookings page')).toBeInTheDocument();
  });
});
