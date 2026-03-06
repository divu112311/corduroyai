-- Tariff Database Code Key reference tables
-- Source: td-codes.pdf
-- 4 separate tables for rate types, import programs, GSP excluded countries, and quantity codes

-- ============================================================
-- A. Rate Type Codes
-- Used in: mfn_rate_type_code, col2_rate_type_code, and all
-- country-specific rate_type_code fields
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tariff_rate_types (
  code varchar(5) PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO public.tariff_rate_types (code, description) VALUES
  ('0', 'Duty rate is free. No computation necessary'),
  ('1', 'Specific rate*Q1'),
  ('2', 'Specific rate*Q2'),
  ('3', '(Specific rate*Q1) + ("Other" rate*Q2)'),
  ('4', '(Specific rate*Q1) + (Ad Valorem rate*Value)'),
  ('5', '(Specific rate*Q2) + (Ad Valorem rate*Value)'),
  ('6', '(Specific rate*Q1) + ("Other" rate*Q2) + (Ad Valorem rate*Value)'),
  ('7', 'Ad Valorem rate*Value'),
  ('9', 'Ad Valorem rate*Derived Duty. Refer to HTS for duty computation procedures.'),
  ('K', 'Refer to HTS for duty computation procedures.'),
  ('X', 'Refer to HTS for duty computation procedures.'),
  ('T', 'This duty must be computed at the 10-digit level. Refer to the HTS for duty rates.')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.tariff_rate_types IS 'Tariff rate type codes - defines how duty is computed for each HTS code.';

-- ============================================================
-- B. Import Program Codes
-- Used in: col1_special_text field and country indicator fields
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tariff_import_programs (
  code varchar(5) PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO public.tariff_import_programs (code, description) VALUES
  ('A', 'Generalized System of Preferences (GSP) (duty-free treatment)'),
  ('A*', 'Certain countries excluded from GSP eligibility for that HTS subheading (duty-free treatment)'),
  ('A+', 'Only imports from least-developed beneficiary developing countries are eligible for GSP (duty-free treatment)'),
  ('AU', 'Australia Special Rate'),
  ('B', 'Automotive Products Trade Act (APTA) (duty-free treatment)'),
  ('BH', 'Bahrain Special Rate'),
  ('C', 'Agreement on Trade in Civil Aircraft (duty-free treatment)'),
  ('CA', 'NAFTA for Canada (duty-free treatment)'),
  ('CL', 'Chile Special Rate'),
  ('CO', 'Colombia Special Rate'),
  ('D', 'Africa Growth and Opportunity Act (AGOA) (duty-free treatment)'),
  ('E', 'Caribbean Basin Initiative (CBI)'),
  ('E*', 'Certain countries or products excluded from CBI eligibility'),
  ('IL', 'Israel Special Rate (duty-free treatment)'),
  ('J', 'Andean Trade Preference Act (ATPA)'),
  ('J*', 'Certain products excluded from ATPA eligibility'),
  ('J+', 'Andean Trade Promotion and Drug Eradication Act (ATPDEA)'),
  ('JO', 'Jordan Special Rate'),
  ('JP', 'Japan Special Rate'),
  ('K', 'Agreement on Trade in Pharmaceutical Products (duty-free treatment)'),
  ('KR', 'Korea Special Rate'),
  ('L', 'Uruguay Round Concessions on Intermediate Chemicals for Dyes (duty-free treatment)'),
  ('MA', 'Morocco Special Rate'),
  ('MX', 'NAFTA for Mexico'),
  ('NP', 'Nepal Special Rate'),
  ('OM', 'Oman Special Rate'),
  ('P', 'Dominican Republic-Central American Special Rate (DR-CAFTA)'),
  ('P+', 'Dominican Republic-Central American Plus Rate (DR-CAFTA Plus)'),
  ('PA', 'Panama Special Rate'),
  ('PE', 'Peru Special Rate'),
  ('R', 'Caribbean Basin Trade Partnership Act (CBTPA)'),
  ('S', 'United States-Mexico-Canada Agreement (USMCA)'),
  ('S+', 'United States-Mexico-Canada Agreement Plus (USMCA Plus)'),
  ('SG', 'Singapore Special Rate')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.tariff_import_programs IS 'Import program codes - trade agreements and preferential duty programs.';

-- ============================================================
-- C. GSP Excluded Country Codes
-- Used in: gsp_ctry_excluded field
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tariff_gsp_excluded (
  code varchar(5) PRIMARY KEY,
  country_name text NOT NULL
);

INSERT INTO public.tariff_gsp_excluded (code, country_name) VALUES
  ('AR', 'Argentina'),
  ('BA', 'Bosnia and Herzegovina'),
  ('BR', 'Brazil'),
  ('BZ', 'Belize'),
  ('CI', 'Cote d''Ivoire'),
  ('CL', 'Chile'),
  ('CO', 'Colombia'),
  ('CR', 'Costa Rica'),
  ('DO', 'Dominican Republic'),
  ('EC', 'Ecuador'),
  ('EE', 'Estonia'),
  ('EG', 'Egypt'),
  ('FK', 'Falkland Islands'),
  ('GT', 'Guatemala'),
  ('GY', 'Guyana'),
  ('ID', 'Indonesia'),
  ('IN', 'India'),
  ('JM', 'Jamaica'),
  ('JO', 'Jordan'),
  ('KZ', 'Kazakhstan'),
  ('MA', 'Morocco'),
  ('MK', 'North Macedonia'),
  ('PA', 'Panama'),
  ('PE', 'Peru'),
  ('PH', 'Philippines'),
  ('PK', 'Pakistan'),
  ('RU', 'Russia'),
  ('SI', 'Slovenia'),
  ('SR', 'Suriname'),
  ('TH', 'Thailand'),
  ('TR', 'Turkey'),
  ('TT', 'Trinidad and Tobago'),
  ('UA', 'Ukraine'),
  ('VE', 'Venezuela'),
  ('ZA', 'South Africa')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.tariff_gsp_excluded IS 'Countries excluded from GSP eligibility for specific HTS subheadings.';

-- ============================================================
-- D. Quantity Codes
-- Used in: quantity_1_code and quantity_2_code fields
-- ============================================================
CREATE TABLE IF NOT EXISTS public.tariff_quantity_codes (
  code varchar(10) PRIMARY KEY,
  description text NOT NULL
);

INSERT INTO public.tariff_quantity_codes (code, description) VALUES
  ('BBL', 'barrels'),
  ('C', 'Celsius'),
  ('CAR', 'carats'),
  ('CC', 'cubic centimeters'),
  ('CG', 'centigrams'),
  ('CGM', 'component grams'),
  ('CKG', 'component kilograms'),
  ('CM', 'centimeters'),
  ('CM2', 'square centimeters'),
  ('CM3', 'cubic centimeters'),
  ('CTN', 'component tons'),
  ('CU.', 'cubic'),
  ('CUR', 'Curie'),
  ('CY', 'clean yield'),
  ('CYK', 'clean yield kilograms'),
  ('D', 'denier'),
  ('DOZ', 'dozens'),
  ('DPC', 'dozen pieces'),
  ('DPR', 'dozen pairs'),
  ('DS', 'doses'),
  ('FBM', 'fiber meters'),
  ('G', 'grams'),
  ('GBQ', 'Gigabecquerels'),
  ('GCN', 'gross containers'),
  ('GKG', 'gold content grams'),
  ('GM', 'grams'),
  ('GR', 'gross'),
  ('GRL', 'gross lines'),
  ('GRS', 'gross'),
  ('GVW', 'gross vehicle weight'),
  ('HND', 'hundred units'),
  ('HUN', 'hundred units'),
  ('IRC', 'Internal Revenue Code'),
  ('JWL', 'jewels'),
  ('K', 'thousand units'),
  ('KCAL', 'kilocalories'),
  ('KG', 'kilograms'),
  ('KHZ', 'kilohertz'),
  ('KM', 'kilometers'),
  ('KM3', 'kilograms per cubic meter'),
  ('KN', 'kilonewtons'),
  ('KTS', 'kilograms total sugars'),
  ('KVA', 'kilovolt-amperes'),
  ('KVAR', 'kilovolt-amperes reactive'),
  ('KW', 'kilowatts'),
  ('KWH', 'kilowatt-hours'),
  ('L', 'liters'),
  ('LIN', 'linear'),
  ('LNM', 'linear meters'),
  ('LTR', 'liters'),
  ('M', 'meters'),
  ('M2', 'square meters'),
  ('M3', 'cubic meters'),
  ('MBQ', 'Megabecquerels'),
  ('MC', 'millicuries'),
  ('MG', 'milligrams'),
  ('MHZ', 'megahertz'),
  ('ML', 'milliliters'),
  ('MM', 'millimeters'),
  ('MPA', 'megapascals'),
  ('NA', 'Not available. This code used when more than one units of quantity exist for the component 10-digit subheadings'),
  ('NO', 'number'),
  ('ODE', 'ozone depletion equivalent'),
  ('PCS', 'pieces'),
  ('PF', 'proof'),
  ('PFL', 'proof liters'),
  ('PK', 'pack'),
  ('PRS', 'pairs'),
  ('RBA', 'Running Bales'),
  ('RPM', 'revolutions per minute'),
  ('SBE', 'standard brick equivalent'),
  ('SME', 'square meters equivalent'),
  ('SQ', 'squares'),
  ('SQM', 'square meters'),
  ('T', 'metric tons'),
  ('THS', 'thousand units'),
  ('TNV', 'ton raw value'),
  ('TON', 'tons'),
  ('V', 'volts'),
  ('W', 'watts'),
  ('WTS', 'weight'),
  ('X', 'no quantity data collected')
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.tariff_quantity_codes IS 'Quantity unit codes used in tariff rate computations.';
