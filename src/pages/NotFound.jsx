import { Link } from 'react-router-dom';
import { buttonClasses } from '../lib/ui';

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-brand-700">Error 404</p>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-3 text-sm text-slate-600">
        The page you are looking for does not exist or may have been moved.
      </p>
      <Link to="/" className={`${buttonClasses({ size: 'lg' })} mt-6`}>
        Go home
      </Link>
    </div>
  );
}
