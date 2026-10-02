import { Link } from 'react-router-dom';
import { CalendarCheck, Clock, Dumbbell, ShieldCheck, Zap } from 'lucide-react';
import { PRICING_TIERS, OPERATING_HOURS } from '../lib/constants';
import { formatCurrency, formatTime } from '../lib/format';
import { buttonClasses } from '../lib/ui';
import { useCourts } from '../hooks/useCourts';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';

const HIGHLIGHTS = [
  {
    Icon: CalendarCheck,
    title: 'Pick your slot',
    body: 'See live availability by court, date and hour — what you see is what you can book.',
  },
  {
    Icon: Zap,
    title: 'Instant confirmation',
    body: 'Pay online with GCash, Maya, or card and get a confirmation SMS right away.',
  },
  {
    Icon: ShieldCheck,
    title: 'Fair booking',
    body: 'Slots are reserved only after payment, so nobody can take the time you chose.',
  },
];

export default function Home() {
  const courtsQuery = useCourts();
  const courts = courtsQuery.data ?? [];

  return (
    <>
      <section className="bg-gradient-to-b from-brand-700 to-brand-800 text-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <p className="text-sm font-semibold uppercase tracking-widest text-brand-100">
            Court reservations
          </p>
          <h1 className="mt-3 max-w-2xl text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Book a pickleball court in under a minute
          </h1>
          <p className="mt-4 max-w-xl text-base text-brand-50 sm:text-lg">
            Choose your court, pick an available hour, and pay securely. Booking details are sent
            straight to your phone.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/book"
              className={buttonClasses({
                variant: 'primary',
                size: 'lg',
                className: 'bg-white text-brand-800 hover:bg-brand-50',
              })}
            >
              Book a court
            </Link>
            <Link
              to="/my-bookings"
              className={buttonClasses({
                variant: 'outline',
                size: 'lg',
                className: 'border-white/40 bg-transparent text-white hover:bg-white/10',
              })}
            >
              View my bookings
            </Link>
          </div>
          <dl className="mt-10 grid max-w-xl grid-cols-2 gap-4 border-t border-white/20 pt-6 text-sm">
            <div>
              <dt className="text-brand-100">Operating hours</dt>
              <dd className="mt-1 font-semibold">
                {formatTime(OPERATING_HOURS.open)} – {formatTime(OPERATING_HOURS.close)}
              </dd>
            </div>
            <div>
              <dt className="text-brand-100">Advance booking</dt>
              <dd className="mt-1 font-semibold">Up to 30 days ahead</dd>
            </div>
          </dl>
        </div>
      </section>

      {courtsQuery.isConfigured ? (
        <section aria-labelledby="courts-heading" className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <h2 id="courts-heading" className="text-2xl font-bold text-slate-900">
            Our courts
          </h2>
          {courtsQuery.isPending ? (
            <div
              role="status"
              aria-label="Loading courts"
              className="mt-6 grid gap-4 sm:grid-cols-3"
            >
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          ) : courtsQuery.isError ? (
            <p className="mt-4 text-sm text-slate-600">
              Court listings are unavailable right now — please try again later.
            </p>
          ) : courts.length === 0 ? null : (
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              {courts.map((court) => (
                <Card key={court.id} className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Dumbbell className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">
                      {court.name}
                    </span>
                    <span className="block text-sm capitalize text-slate-500">{court.type}</span>
                  </span>
                </Card>
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="rates-heading" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
        <h2 id="rates-heading" className="text-2xl font-bold text-slate-900">
          Court rates
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Per court, per hour. Prices shown in Philippine pesos.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {PRICING_TIERS.map((tier) => (
            <Card key={tier.tier} className="transition-shadow hover:shadow-md">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
                {tier.label}
              </p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{formatCurrency(tier.rate)}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
                <Clock className="h-4 w-4" aria-hidden="true" />
                {formatTime(tier.from)} – {formatTime(tier.to)}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="how-heading" className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <h2 id="how-heading" className="text-2xl font-bold text-slate-900">
            How it works
          </h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-3">
            {HIGHLIGHTS.map(({ Icon, title, body }, index) => (
              <div key={title} className="rounded-xl border border-slate-200 p-5">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-4 text-sm font-semibold text-slate-900">
                  {index + 1}. {title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
