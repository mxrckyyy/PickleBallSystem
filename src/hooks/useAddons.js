/**
 * Active add-ons (spec §5 PostgREST `GET /rest/v1/addons`).
 * Paddle, ball, coach extras offered during booking (§4).
 */
import { useQuery } from '@tanstack/react-query';
import { CACHE_TTL } from '../lib/constants.js';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export function useAddons() {
  const query = useQuery({
    queryKey: ['addons'],
    enabled: isSupabaseConfigured,
    staleTime: CACHE_TTL.courts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('addons')
        .select('id, name, price, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return { ...query, isConfigured: isSupabaseConfigured };
}
