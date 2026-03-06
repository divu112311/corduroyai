-- ============================================================================
-- Add RLS policies for tariff tables
--
-- The tariff_rates and country_tariff_mapping tables need SELECT policies
-- for authenticated and anon users so the frontend can query them.
-- ============================================================================

-- tariff_rates: enable RLS and allow reads
ALTER TABLE public.tariff_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on tariff_rates"
  ON public.tariff_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read on tariff_rates"
  ON public.tariff_rates FOR SELECT
  TO anon
  USING (true);

-- country_tariff_mapping: enable RLS and allow reads
ALTER TABLE public.country_tariff_mapping ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated read on country_tariff_mapping"
  ON public.country_tariff_mapping FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow anon read on country_tariff_mapping"
  ON public.country_tariff_mapping FOR SELECT
  TO anon
  USING (true);
