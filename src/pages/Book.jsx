/**
 * Booking flow (spec §6 step 1): court → date/time → add-ons → details.
 * Selection state lives in the Zustand store so it survives route changes;
 * it is never a source of truth for availability, price or status.
 *
 * Phase 4 renders the full selection UI. Availability checking (Phase 5),
 * sign-in enforcement at confirmation and payment (Phase 6, decision J17).
 */
import { useState } from 'react';
import { toast } from 'sonner';
import { useAddons } from '../hooks/useAddons.js';
import { useCourts } from '../hooks/useCourts.js';
import { useBookingStore } from '../stores/bookingStore.js';
import { buildSlotStarts, slotEndFor } from '../lib/booking.js';
import { isValidPHPhone } from '../lib/format.js';
import { Button } from '../components/ui/Button.jsx';
import { Card } from '../components/ui/Card.jsx';
import { CourtSelector } from '../components/booking/CourtSelector.jsx';
import { DatePicker } from '../components/booking/DatePicker.jsx';
import { TimeSlotGrid } from '../components/booking/TimeSlotGrid.jsx';
import { AddOnSelector } from '../components/booking/AddOnSelector.jsx';
import { BookingSummary } from '../components/booking/BookingSummary.jsx';
import { CustomerDetailsForm } from '../components/booking/CustomerDetailsForm.jsx';

const SLOTS = buildSlotStarts();

export default function Book() {
  const courtsQuery = useCourts();
  const addonsQuery = useAddons();
  const store = useBookingStore();
  const [detailsSaved, setDetailsSaved] = useState(false);

  const selectedCourt = courtsQuery.data?.find((court) => court.id === store.courtId) ?? null;
  const hasDetails = store.customer.name.trim().length >= 2 && isValidPHPhone(store.customer.phone);
  const canContinue = Boolean(store.courtId && store.bookingDate && store.startTime && hasDetails);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-bold text-slate-900">Book a court</h1>
      <p className="mt-1 text-sm text-slate-600">
        Pick a court, date and time, add your details, then continue to payment.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="1 · Choose a court" description="All courts are bookable by the hour.">
            <CourtSelector
              courts={courtsQuery.data ?? []}
              selectedId={store.courtId}
              onSelect={(court) => store.setCourt(court.id, court.name)}
              loading={courtsQuery.isPending && courtsQuery.isConfigured}
              error={courtsQuery.isError ? courtsQuery.error : null}
              onRetry={() => courtsQuery.refetch()}
              isConfigured={courtsQuery.isConfigured}
            />
          </Card>

          <Card title="2 · Pick a date and time" description="Hourly slots, 6:00 AM – 10:00 PM.">
            <div className="max-w-xs">
              <DatePicker value={store.bookingDate ?? ''} onChange={store.setBookingDate} />
            </div>
            <div className="mt-5">
              <TimeSlotGrid
                bookingDate={store.bookingDate}
                slots={SLOTS}
                selectedStart={store.startTime}
                onSelect={(start) =>
                  store.setSlot({ startTime: start, endTime: slotEndFor(start) })
                }
                disabled={!store.courtId}
              />
            </div>
          </Card>

          <Card title="3 · Add-ons (optional)" description="Extras you can bring along.">
            <AddOnSelector
              addons={addonsQuery.data ?? []}
              selected={store.addons}
              onToggle={store.toggleAddon}
              onQuantity={store.setAddonQuantity}
              loading={addonsQuery.isPending && addonsQuery.isConfigured}
              error={addonsQuery.isError ? addonsQuery.error : null}
              isConfigured={addonsQuery.isConfigured}
            />
          </Card>

          <Card title="4 · Your details" description="Who is the booking for?">
            <CustomerDetailsForm
              values={store.customer}
              onSubmit={(details) => {
                store.setCustomer(details);
                setDetailsSaved(true);
                toast.success('Details saved');
              }}
            />
            {detailsSaved ? (
              <p className="mt-3 text-sm font-medium text-emerald-700" role="status">
                Details saved — you&apos;re ready to continue.
              </p>
            ) : null}
          </Card>
        </div>

        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <BookingSummary
              courtName={store.courtName ?? selectedCourt?.name ?? ''}
              bookingDate={store.bookingDate}
              startTime={store.startTime}
              endTime={store.endTime}
              addons={store.addons}
            >
              <Button type="button" className="w-full" disabled={!canContinue}>
                Continue to payment
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                Sign-in is required when you confirm the booking. Payment arrives next.
              </p>
            </BookingSummary>
          </div>
        </div>
      </div>
    </div>
  );
}
