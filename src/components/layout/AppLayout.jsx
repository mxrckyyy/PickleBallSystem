import { Outlet } from 'react-router-dom';
import { Toaster } from 'sonner';
import { Navbar } from './Navbar';
import { Footer } from './Footer';
import { MobileNav } from './MobileNav';

/** Shared application shell: top navigation, content, footer, mobile tab bar, toasts. */
export function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col pb-16 md:pb-0">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <MobileNav />
      <Toaster position="top-center" richColors closeButton />
    </div>
  );
}
