import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from './lib/queryClient';
import { AuthProvider } from './hooks/useAuth.jsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppLayout } from './components/layout/AppLayout';
import { RequireAuth } from './components/RequireAuth';
import { Skeleton } from './components/ui/Skeleton';

const Home = lazy(() => import('./pages/Home.jsx'));
const Book = lazy(() => import('./pages/Book.jsx'));
const BookingSuccess = lazy(() => import('./pages/BookingSuccess.jsx'));
const MyBookings = lazy(() => import('./pages/MyBookings.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

const queryClient = createQueryClient();

function RouteFallback() {
  return (
    <div role="status" aria-label="Loading page" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <Skeleton className="h-8 w-56" />
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route element={<AppLayout />}>
                  <Route index element={<Home />} />
                  <Route path="book" element={<Book />} />
                  {/* Public on purpose: the payload is an RLS-scoped `ref`, and
                      the payment phase redirects back here after checkout. */}
                  <Route path="booking/success" element={<BookingSuccess />} />
                  <Route
                    path="my-bookings"
                    element={
                      <RequireAuth>
                        <MyBookings />
                      </RequireAuth>
                    }
                  />
                  <Route path="login" element={<Login />} />
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
