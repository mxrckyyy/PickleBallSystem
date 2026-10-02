/**
 * Active courts (spec §5 PostgREST `GET /rest/v1/courts`).
 * 5-minute cache tier (§12 CACHE_TTL.courts). Read-only: only is_active courts
 * are ever shown to customers; admin management is a later phase.
 */
import { useQuery } from '@tanstack/react-query';
import { CACHE_TTL } from '../lib/constants.js';
import { isSupabaseConfigured, supabase } from '../lib/supabase.js';

export function useCourts() {
  const query = useQuery({
    queryKey: ['courts'],
    enabled: isSupabaseConfigured,
    staleTime: CACHE_TTL.courts,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('courts')
        .select('id, name, type, image_url, is_active')
        .eq('is_active', true)
        .order('name', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return { ...query, isConfigured: isSupabaseConfigured };
}
