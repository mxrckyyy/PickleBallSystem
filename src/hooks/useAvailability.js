/**
 * Live court availability (spec §5 — PostgREST `POST /rest/v1/rpc/get_availability`).
 *
 * The RPC is SECURITY DEFINER on the server: it is the only way to know whether
 * somebody ELSE already holds a slot, because raw `bookings` reads are RLS
 * scoped to their own rows (§7). The response carries availability flags and
 * §6 prices only — never a name, phone or e-mail.
 *
 * Cache: 30 s (§12 `CACHE_TTL.availability`). Freshness afterwards comes from
 * the Realtime channel `court-{id}-{date}` (§5 naming): any client that changes
 * the grid broadcasts `availability-changed` and every open booking screen
 * refetches. `postgres_changes` is deliberately NOT used — its rows are filtered
 * by RLS, so a guest would never receive another customer's booking event.
 */
import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CACHE_TTL, REALTIME_CHANNELS } from '../lib/constants.js';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

/** Realtime broadcast event meaning "this court/date grid changed". */
export const AVAILABILITY_CHANGED = 'availability-changed';

/** TanStack Query key for one court + date. */
export function availabilityKey(courtId, bookingDate) {
  return ['availability', courtId, bookingDate];
}

/**
 * Tell every open booking screen that a court/date grid changed.
 *
 * Publishing over the library's HTTP broadcast fallback, so no websocket
 * subscription is needed. Phase 6 calls this after a booking is created,
 * cancelled or expired.
 *
 * @returns {Promise<boolean>} true when the broadcast was accepted.
 */
export async function publishAvailabilityChange(courtId, bookingDate) {
  if (!isSupabaseConfigured || !courtId || !bookingDate) return false;
  const channel = supabase.channel(REALTIME_CHANNELS.courtAvailability(courtId, bookingDate));
  const result = await channel.send({
    type: 'broadcast',
    event: AVAILABILITY_CHANGED,
    payload: { courtId, bookingDate },
  });
  return result === 'ok';
}

/**
 * @param {string|null} courtId
 * @param {string|null} bookingDate 'YYYY-MM-DD'
 * @returns query result plus `isConfigured`, `slots`, `slotStarts`,
 *          `unavailable` (Map start -> 'booked' | 'past') and `live`.
 */
export function useAvailability(courtId, bookingDate) {
  const queryClient = useQueryClient();
  const enabled = Boolean(isSupabaseConfigured && courtId && bookingDate);

  const query = useQuery({
    queryKey: availabilityKey(courtId, bookingDate),
    enabled,
    staleTime: CACHE_TTL.availability,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_availability', {
        p_court_id: courtId,
        p_booking_date: bookingDate,
      });
      if (error) throw error;
      return data;
    },
  });

  const data = query.data;

  useEffect(() => {
    if (!enabled) return undefined;
    const topic = REALTIME_CHANNELS.courtAvailability(courtId, bookingDate);
    const channel = supabase.channel(topic);
    const onChange = () => {
      queryClient.invalidateQueries({ queryKey: availabilityKey(courtId, bookingDate) });
    };
    channel.on('broadcast', { event: AVAILABILITY_CHANGED }, onChange).subscribe();
    // Supabase reuses one channel object per topic, so a remount re-joins the
    // same channel instead of opening a second socket.
    return () => {
      supabase.removeChannel(channel);
    };
  }, [enabled, courtId, bookingDate, queryClient]);

  const slotStarts = useMemo(
    () => (Array.isArray(data?.slots) ? data.slots.map((slot) => slot.start) : null),
    [data],
  );

  const unavailable = useMemo(() => {
    const map = new Map();
    if (!Array.isArray(data?.slots)) return map;
    for (const slot of data.slots) {
      if (!slot.available) map.set(slot.start, slot.reason ?? 'booked');
    }
    return map;
  }, [data]);

  return {
    ...query,
    isConfigured: isSupabaseConfigured,
    slots: data?.slots ?? null,
    slotStarts,
    unavailable,
    live: Boolean(data),
  };
}
