import { formatCurrency } from '../../lib/format.js';
import { Alert } from '../ui/Alert.jsx';
import { Skeleton } from '../ui/Skeleton.jsx';

/**
 * Step 3 — optional add-ons (spec §4: paddle, ball, coach).
 * Selection lives in the booking store as [{ id, name, price, quantity }].
 */
export function AddOnSelector({
  addons = [],
  selected = [],
  onToggle,
  onQuantity,
  loading = false,
  error = null,
  isConfigured = true,
}) {
  if (!isConfigured) return null;

  if (loading) {
    return (
      <div role="status" aria-label="Loading add-ons" className="space-y-3">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="danger" title="Could not load add-ons">
        {error.message || 'Add-ons are unavailable right now.'}
      </Alert>
    );
  }

  if (addons.length === 0) {
    return <p className="text-sm text-slate-500">No add-ons available right now.</p>;
  }

  return (
    <ul className="space-y-3">
      {addons.map((addon) => {
        const chosen = selected.find((item) => item.id === addon.id);
        const quantity = chosen?.quantity ?? 0;
        return (
          <li
            key={addon.id}
            className={[
              'flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4',
              chosen ? 'border-brand-600 bg-brand-50' : 'border-slate-200 bg-white',
            ].join(' ')}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input
                type="checkbox"
                checked={Boolean(chosen)}
                onChange={() => onToggle?.(addon)}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <span className="min-w-0">
                <span className="block font-medium text-slate-900">{addon.name}</span>
                <span className="block text-sm text-slate-500">
                  {formatCurrency(addon.price)} each
                </span>
              </span>
            </label>
            {chosen ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={`Remove one ${addon.name}`}
                  onClick={() => onQuantity?.(addon.id, quantity - 1)}
                  className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  −
                </button>
                <span aria-live="polite" className="w-6 text-center text-sm font-semibold">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${addon.name}`}
                  onClick={() => onQuantity?.(addon.id, quantity + 1)}
                  className="h-8 w-8 rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                >
                  +
                </button>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
