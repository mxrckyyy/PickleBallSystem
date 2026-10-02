import { Component } from 'react';

/** Top-level render error boundary — prevents a white screen (spec §13 graceful degradation). */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Unhandled UI error', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          Something went wrong
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">We could not load this page</h1>
        <p className="mt-3 text-sm text-slate-600">
          The error has been logged. Try reloading — if it keeps happening, go back to the home
          page.
        </p>
        {import.meta.env.DEV ? (
          <pre className="mt-4 max-h-40 w-full overflow-auto rounded-lg bg-slate-900 p-3 text-left text-xs text-slate-100">
            {String(error?.message ?? error)}
          </pre>
        ) : null}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-11 rounded-lg bg-brand-600 px-5 text-sm font-medium text-white hover:bg-brand-700"
          >
            Reload
          </button>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="h-11 rounded-lg border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Go home
          </button>
        </div>
      </main>
    );
  }
}
