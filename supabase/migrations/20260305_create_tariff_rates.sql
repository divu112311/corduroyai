-- Create tariff_rates table with all columns from tariff_database_2025.txt
-- 13,058 rows of US tariff schedule data (MFN, Column 2, and 22 FTA preferential rates)

CREATE TABLE IF NOT EXISTS public.tariff_rates (
  hts_code varchar(10) PRIMARY KEY,
  brief_description text,
  quantity_1_code text,
  quantity_2_code text,
  wto_binding_code text,

  -- MFN (Most Favored Nation) rates
  mfn_text_rate text,
  mfn_rate_type_code text,
  mfn_ave text,
  mfn_ad_val_rate numeric(10,6),
  mfn_specific_rate numeric(10,6),
  mfn_other_rate numeric(10,6),

  -- Column 1 Special (trade agreement eligibility)
  col1_special_text text,
  col1_special_mod text,

  -- GSP / APTA / Civil Air
  gsp_indicator text,
  gsp_ctry_excluded text,
  apta_indicator text,
  civil_air_indicator text,

  -- NAFTA
  nafta_canada_ind text,
  nafta_mexico_ind text,

  -- Mexico
  mexico_rate_type_code text,
  mexico_ad_val_rate numeric(10,6),
  mexico_specific_rate numeric(10,6),

  -- CBI
  cbi_indicator text,
  cbi_ad_val_rate numeric(10,6),
  cbi_specific_rate numeric(10,6),

  -- AGOA
  agoa_indicator text,

  -- CBTPA
  cbtpa_indicator text,
  cbtpa_rate_type_code text,
  cbtpa_ad_val_rate numeric(10,6),
  cbtpa_specific_rate numeric(10,6),

  -- Israel FTA
  israel_fta_indicator text,

  -- ATPA
  atpa_indicator text,
  atpa_ad_val_rate numeric(10,6),
  atpa_specific_rate numeric(10,6),

  -- ATPDEA
  atpdea_indicator text,

  -- Jordan
  jordan_indicator text,
  jordan_rate_type_code text,
  jordan_ad_val_rate numeric(10,6),
  jordan_specific_rate numeric(10,6),
  jordan_other_rate numeric(10,6),

  -- Singapore
  singapore_indicator text,
  singapore_rate_type_code text,
  singapore_ad_val_rate numeric(10,6),
  singapore_specific_rate numeric(10,6),
  singapore_other_rate numeric(10,6),

  -- Chile
  chile_indicator text,
  chile_rate_type_code text,
  chile_ad_val_rate numeric(10,6),
  chile_specific_rate numeric(10,6),
  chile_other_rate numeric(10,6),

  -- Morocco
  morocco_indicator text,
  morocco_rate_type_code text,
  morocco_ad_val_rate numeric(10,6),
  morocco_specific_rate numeric(10,6),
  morocco_other_rate numeric(10,6),

  -- Australia
  australia_indicator text,
  australia_rate_type_code text,
  australia_ad_val_rate numeric(10,6),
  australia_specific_rate numeric(10,6),
  australia_other_rate numeric(10,6),

  -- Bahrain
  bahrain_indicator text,
  bahrain_rate_type_code text,
  bahrain_ad_val_rate numeric(10,6),
  bahrain_specific_rate numeric(10,6),
  bahrain_other_rate numeric(10,6),

  -- DR-CAFTA
  dr_cafta_indicator text,
  dr_cafta_rate_type_code text,
  dr_cafta_ad_val_rate numeric(10,6),
  dr_cafta_specific_rate numeric(10,6),
  dr_cafta_other_rate numeric(10,6),

  -- DR-CAFTA Plus
  dr_cafta_plus_indicator text,
  dr_cafta_plus_rate_type_code text,
  dr_cafta_plus_ad_val_rate numeric(10,6),
  dr_cafta_plus_specific_rate numeric(10,6),
  dr_cafta_plus_other_rate numeric(10,6),

  -- Oman
  oman_indicator text,
  oman_rate_type_code text,
  oman_ad_val_rate numeric(10,6),
  oman_specific_rate numeric(10,6),
  oman_other_rate numeric(10,6),

  -- Peru
  peru_indicator text,
  peru_rate_type_code text,
  peru_ad_val_rate numeric(10,6),
  peru_specific_rate numeric(10,6),
  peru_other_rate numeric(10,6),

  -- Pharmaceutical / Dyes
  pharmaceutical_ind text,
  dyes_indicator text,

  -- Column 2 rates
  col2_text_rate text,
  col2_rate_type_code text,
  col2_ad_val_rate numeric(10,6),
  col2_specific_rate numeric(10,6),
  col2_other_rate numeric(10,6),

  -- Effective dates
  begin_effect_date date,
  end_effective_date date,

  -- Additional info
  footnote_comment text,
  additional_duty text,

  -- Korea
  korea_indicator text,
  korea_rate_type_code text,
  korea_ad_val_rate numeric(10,6),
  korea_specific_rate numeric(10,6),
  korea_other_rate numeric(10,6),

  -- Colombia
  colombia_indicator text,
  colombia_rate_type_code text,
  colombia_ad_val_rate numeric(10,6),
  colombia_specific_rate numeric(10,6),
  colombia_other_rate numeric(10,6),

  -- Panama
  panama_indicator text,
  panama_rate_type_code text,
  panama_ad_val_rate numeric(10,6),
  panama_specific_rate numeric(10,6),
  panama_other_rate numeric(10,6),

  -- Nepal
  nepal_indicator text,

  -- Japan
  japan_indicator text,
  japan_rate_type_code text,
  japan_ad_val_rate numeric(10,6),
  japan_specific_rate numeric(10,6),
  japan_other_rate numeric(10,6),

  -- USMCA
  usmca_indicator text,
  usmca_rate_type_code text,
  usmca_ad_val_rate numeric(10,6),
  usmca_specific_rate numeric(10,6),
  usmca_other_rate numeric(10,6),

  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by HTS code prefix (for 10-digit to 8-digit matching)
CREATE INDEX IF NOT EXISTS idx_tariff_rates_hts_code ON public.tariff_rates (hts_code);

COMMENT ON TABLE public.tariff_rates IS 'US tariff schedule rates from tariff_database_2025. One row per 8-digit HTS code with MFN, Column 2, and FTA preferential rates.';
