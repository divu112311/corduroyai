-- Country-Tariff Mapping Table
-- Maps countries to their applicable tariff treatment columns in tariff_rates
-- Connected to existing countries table via country_id FK
--
-- primary_treatment: 'fta' (Free Trade Agreement), 'mfn' (Most Favored Nation), 'col2' (Column 2)
-- fta_column_prefix: column prefix in tariff_rates (e.g., 'korea' → korea_indicator, korea_ad_val_rate, etc.)
-- fta_indicator_column: the indicator column name in tariff_rates for checking eligibility

-- Drop old version if it exists (had country_name instead of country_id FK)
DROP TABLE IF EXISTS public.country_tariff_mapping;

CREATE TABLE public.country_tariff_mapping (
  id SERIAL PRIMARY KEY,
  country_id INTEGER NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  primary_treatment text NOT NULL DEFAULT 'mfn',
  fta_column_prefix text,
  fta_indicator_column text,
  import_program_code varchar(5),
  gsp_eligible boolean DEFAULT false,
  agoa_eligible boolean DEFAULT false,
  cbi_eligible boolean DEFAULT false,
  cbtpa_eligible boolean DEFAULT false,
  notes text,
  UNIQUE(country_id)
);

-- ============================================================
-- 1. FTA COUNTRIES (Bilateral/Regional Trade Agreements)
-- These have dedicated rate columns in tariff_rates
-- ============================================================

-- USMCA (United States-Mexico-Canada Agreement)
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'usmca', 'usmca_indicator', 'S', 'USMCA; also legacy nafta_canada_ind'
FROM countries WHERE iso_alpha2 = 'CA'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'usmca', 'usmca_indicator', 'S', 'USMCA; also legacy mexico_* and nafta_mexico_ind columns'
FROM countries WHERE iso_alpha2 = 'MX'
ON CONFLICT (country_id) DO NOTHING;

-- Bilateral FTAs
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'australia', 'australia_indicator', 'AU', 'US-Australia FTA'
FROM countries WHERE iso_alpha2 = 'AU'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'bahrain', 'bahrain_indicator', 'BH', 'US-Bahrain FTA'
FROM countries WHERE iso_alpha2 = 'BH'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'chile', 'chile_indicator', 'CL', 'US-Chile FTA'
FROM countries WHERE iso_alpha2 = 'CL'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'colombia', 'colombia_indicator', 'CO', 'US-Colombia TPA'
FROM countries WHERE iso_alpha2 = 'CO'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', NULL, 'israel_fta_indicator', 'IL', 'US-Israel FTA; indicator only, no rate columns'
FROM countries WHERE iso_alpha2 = 'IL'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'japan', 'japan_indicator', 'JP', 'US-Japan Trade Agreement'
FROM countries WHERE iso_alpha2 = 'JP'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'jordan', 'jordan_indicator', 'JO', 'US-Jordan FTA'
FROM countries WHERE iso_alpha2 = 'JO'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'morocco', 'morocco_indicator', 'MA', 'US-Morocco FTA'
FROM countries WHERE iso_alpha2 = 'MA'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', NULL, 'nepal_indicator', 'NP', 'Nepal preferential; indicator only, no rate columns'
FROM countries WHERE iso_alpha2 = 'NP'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'oman', 'oman_indicator', 'OM', 'US-Oman FTA'
FROM countries WHERE iso_alpha2 = 'OM'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'panama', 'panama_indicator', 'PA', 'US-Panama TPA'
FROM countries WHERE iso_alpha2 = 'PA'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'peru', 'peru_indicator', 'PE', 'US-Peru TPA'
FROM countries WHERE iso_alpha2 = 'PE'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'singapore', 'singapore_indicator', 'SG', 'US-Singapore FTA'
FROM countries WHERE iso_alpha2 = 'SG'
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'korea', 'korea_indicator', 'KR', 'KORUS FTA'
FROM countries WHERE iso_alpha2 = 'KR'
ON CONFLICT (country_id) DO NOTHING;

-- DR-CAFTA (Dominican Republic-Central America FTA)
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, fta_column_prefix, fta_indicator_column, import_program_code, notes)
SELECT id, 'fta', 'dr_cafta', 'dr_cafta_indicator', 'P', 'DR-CAFTA'
FROM countries WHERE iso_alpha2 IN ('CR', 'DO', 'SV', 'GT', 'HN', 'NI')
ON CONFLICT (country_id) DO NOTHING;

-- ============================================================
-- 2. COLUMN 2 COUNTRIES (Non-NTR / Sanctioned)
-- Use col2_* rate columns in tariff_rates
-- ============================================================

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, notes)
SELECT id, 'col2', 'Column 2 rates apply'
FROM countries WHERE iso_alpha2 IN ('CU', 'KP')
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, notes)
SELECT id, 'col2', 'Column 2 since 2022 (PNTR revoked)'
FROM countries WHERE iso_alpha2 IN ('RU', 'BY')
ON CONFLICT (country_id) DO NOTHING;

-- ============================================================
-- 3. AGOA-ELIGIBLE COUNTRIES (African Growth & Opportunity Act)
-- Check agoa_indicator on tariff_rates row; if Y, duty-free
-- ============================================================

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, agoa_eligible, gsp_eligible, notes)
SELECT id, 'mfn', true, true, 'AGOA eligible'
FROM countries WHERE iso_alpha2 IN (
  'AO', 'BJ', 'BW', 'BF', 'CV', 'CM', 'TD', 'KM',
  'CG', 'CD', 'CI', 'DJ', 'SZ', 'GA', 'GM', 'GH',
  'GN', 'GW', 'KE', 'LS', 'LR', 'MG', 'MW', 'ML',
  'MR', 'MU', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST',
  'SN', 'SL', 'ZA', 'TZ', 'TG', 'ZM'
)
ON CONFLICT (country_id) DO NOTHING;

-- ============================================================
-- 4. CBI-ONLY COUNTRIES (Caribbean Basin Initiative)
-- Check cbi_indicator on tariff_rates row
-- ============================================================

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, cbi_eligible, gsp_eligible, notes)
SELECT id, 'mfn', true, true, 'CBI eligible'
FROM countries WHERE iso_alpha2 IN ('AG', 'DM', 'GD', 'KN', 'VC', 'MS', 'SR')
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, cbi_eligible, notes)
SELECT id, 'mfn', true, 'CBI eligible (no GSP)'
FROM countries WHERE iso_alpha2 IN ('AW', 'BS', 'VG')
ON CONFLICT (country_id) DO NOTHING;

-- CBI + CBTPA countries
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, cbi_eligible, cbtpa_eligible, gsp_eligible, notes)
SELECT id, 'mfn', true, true, true, 'CBI + CBTPA eligible'
FROM countries WHERE iso_alpha2 IN ('BB', 'BZ', 'GY', 'HT', 'JM', 'LC', 'TT')
ON CONFLICT (country_id) DO NOTHING;

INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, cbi_eligible, cbtpa_eligible, notes)
SELECT id, 'mfn', true, true, 'CBI + CBTPA eligible (no GSP)'
FROM countries WHERE iso_alpha2 = 'CW'
ON CONFLICT (country_id) DO NOTHING;

-- ============================================================
-- 5. MAJOR MFN TRADING PARTNERS
-- Use mfn_* rate columns in tariff_rates
-- ============================================================

-- MFN with GSP eligible
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, gsp_eligible, notes)
SELECT id, 'mfn', true, 'MFN rates; GSP eligible'
FROM countries WHERE iso_alpha2 IN (
  'TH', 'ID', 'PH', 'BD', 'PK', 'KH', 'LK', 'LA',
  'UA', 'RS', 'IQ', 'EG', 'LB', 'KZ', 'UZ',
  'BR', 'AR', 'EC', 'BO', 'PY', 'UY',
  'FJ', 'PG', 'ET', 'TN', 'DZ',
  'MN', 'GE', 'AM', 'AZ'
)
ON CONFLICT (country_id) DO NOTHING;

-- MFN without GSP
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, notes)
SELECT id, 'mfn', 'MFN rates'
FROM countries WHERE iso_alpha2 IN (
  -- Major Asian partners
  'CN', 'VN', 'TW', 'MY', 'MM',
  -- EU members
  'DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'IE', 'AT', 'PL', 'SE',
  'DK', 'FI', 'PT', 'CZ', 'RO', 'HU', 'GR', 'BG', 'HR', 'SK',
  'SI', 'LT', 'LV', 'EE', 'LU', 'MT', 'CY',
  -- Other European
  'GB', 'CH', 'NO', 'TR',
  -- Middle East
  'SA', 'AE', 'QA', 'KW', 'IR',
  -- Other
  'NZ', 'VE', 'LY'
)
ON CONFLICT (country_id) DO NOTHING;

-- Special notes for specific countries
UPDATE public.country_tariff_mapping
SET notes = 'MFN rates; subject to Section 301 additional duties'
FROM countries c
WHERE country_tariff_mapping.country_id = c.id AND c.iso_alpha2 = 'CN';

UPDATE public.country_tariff_mapping
SET notes = 'MFN rates; GSP terminated June 2019'
FROM countries c
WHERE country_tariff_mapping.country_id = c.id AND c.iso_alpha2 = 'IN'
AND country_tariff_mapping.primary_treatment = 'mfn';

-- If India wasn't inserted above (not in GSP list), insert separately
INSERT INTO public.country_tariff_mapping (country_id, primary_treatment, gsp_eligible, notes)
SELECT id, 'mfn', false, 'MFN rates; GSP terminated June 2019'
FROM countries WHERE iso_alpha2 = 'IN'
ON CONFLICT (country_id) DO NOTHING;

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_country_tariff_mapping_treatment ON public.country_tariff_mapping (primary_treatment);

COMMENT ON TABLE public.country_tariff_mapping IS 'Maps countries to their US tariff treatment. Connected to countries table via country_id FK. Links to tariff_rates column prefixes for FTA countries.';
