import { estimateTotal } from '../../lib/booking.js';
import { formatCurrency, formatDate, formatTimeRange } from '../../lib/format.js';
import { Card } from '../ui/Card.jsx';

/**
 * Step 4 — live booking summary (spec §3).
 * Totals are a CLIENT-SIDE ESTIMATE from the §6 tiers; the database computes
 * the authoritative amount when the booking is created (J3).
 */
export function BookingSummary({
  courtName,
  bookingDate,
  startTime,
  endTime,
  addons = [],
  children,
}) {
  const estimate = estimateTotal({ startTime, addons });
  const hasSlot = Boolean(courtName && bookingDate && startTime);

  const rows = [
    { label: 'Court', value: courtName || '—' },
    { label: 'Date', value: bookingDate ? formatDate(bookingDate) : '—' },
    { label: 'Time', value: startTime ? formatTimeRange(startTime, endTime) : '—' },
    {
      label: estimate.tier ? `Rate (${estimate.tier.label.toLowerCase()})` : 'Court rate',
      value: startTime ? formatCurrency(estimate.courtRate) : '—',
    },
  ];

  return (
    <Card title="Booking summary">
      <dl className="space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start justify-between gap-3">
            <dt className="text-slate-500">{row.label}</dt>
            <dd className="text-right font-medium text-slate-900">{row.value}</dd>
          </div>
        ))}
        {addons.map((addon) => (
          <div key={addon.id} className="flex items-start justify-between gap-3">
            <dt className="text-slate-500">
              {addon.name} × {addon.quantity}
            </dt>
            <dd className="text-right font-medium text-slate-900">
              {formatCurrency(Number(addon.price) * addon.quantity)}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
        <span className="text-sm font-semibold text-slate-700">Estimated total</span>
        <span className="text-lg font-bold text-slate-900">
          {hasSlot || addons.length > 0 ? formatCurrency(estimate.total) : '—'}
        </span>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Final amount is confirmed by the system when the booking is created.
      </p>
      {children ? <div className="mt-4">{children}</div> : null}
    </Card>
  );
}
