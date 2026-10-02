import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

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
import { RequireAuth } from '../../../src/components/RequireAuth.jsx';

function LoginProbe() {
  const location = useLocation();
  return <p>login page {location.search}</p>;
}

function renderGuard(sessionPromise) {
  mocks.getSession.mockReturnValue(sessionPromise);
  return render(
    <MemoryRouter initialEntries={['/my-bookings?date=2026-10-05']}>
      <AuthProvider>
        <Routes>
          <Route
            path="/my-bookings"
            element={
              <RequireAuth>
                <p>protected page</p>
              </RequireAuth>
            }
          />
          <Route path="/login" element={<LoginProbe />} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  });
});

describe('RequireAuth', () => {
  it('shows a loading skeleton while the session is being restored', () => {
    renderGuard(new Promise(() => {}));

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
    expect(screen.queryByText('protected page')).not.toBeInTheDocument();
  });

  it('sends guests to /login with a next parameter', async () => {
    renderGuard(Promise.resolve({ data: { session: null } }));

    const probe = await screen.findByText(/login page/i);
    expect(probe).toHaveTextContent('next=%2Fmy-bookings%3Fdate%3D2026-10-05');
    expect(screen.queryByText('protected page')).not.toBeInTheDocument();
  });

  it('renders the protected page for an authenticated session', async () => {
    renderGuard(
      Promise.resolve({ data: { session: { user: { id: 'u1', phone: '+639171234567' } } } }),
    );

    expect(await screen.findByText('protected page')).toBeInTheDocument();
    expect(screen.queryByText(/login page/i)).not.toBeInTheDocument();
  });
});
