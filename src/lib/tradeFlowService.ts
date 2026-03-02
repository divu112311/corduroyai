import { supabase } from './supabase';

/**
 * Fetch all trade_flow lookup entries (for the Country dropdown).
 * Returns countries that have trade flow data configured in the lookups table.
 */
export async function getTradeFlowCountries(): Promise<{ id: number; name: string }[]> {
  const { data, error } = await supabase
    .from('lookups')
    .select('id, name')
    .eq('type', 'trade_flow')
    .order('name');

  if (error) {
    console.error('Error fetching trade flow countries:', error);
    return [];
  }

  return data || [];
}

/**
 * Fetch partner countries for a given lookup + trade direction.
 * e.g. getTradePartners(indiaLookupId, 'IMPORT') → ['China', 'Russia', 'UAE', ...]
 */
export async function getTradePartners(
  lookupId: number,
  tradeType: 'IMPORT' | 'EXPORT'
): Promise<string[]> {
  const { data, error } = await supabase
    .from('lookup_countries')
    .select('country_name')
    .eq('lookup_id', lookupId)
    .eq('trade_type', tradeType)
    .order('country_name');

  if (error) {
    console.error('Error fetching trade partners:', error);
    return [];
  }

  return (data || []).map((r) => r.country_name);
}
