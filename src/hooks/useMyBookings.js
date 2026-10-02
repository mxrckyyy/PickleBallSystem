/**
 * The signed-in customer's bookings (spec §5 `GET /rest/v1/bookings`).
 * RLS guarantees only the caller's own rows come back (§7); the query still
 * filters by user_id explicitly. Ordered by created_at desc — matches the
 * §4 index `bookings_user_created_idx`.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth.jsx';
import { CACHE_TTL } from '../lib/constants.js';
import { supabase } from '../lib/supabase.js';

export function useMyBookings() {
  const { user, isConfigured } = useAuth();

  const query = useQuery({
    queryKey: ['bookings', 'mine', user?.id],
    enabled: isConfigured && Boolean(user),
    staleTime: CACHE_TTL.bookings,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, booking_date, start_time, end_time, status, total_amount, customer_name, customer_phone, courts(name)',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return { ...query, isConfigured };
}
