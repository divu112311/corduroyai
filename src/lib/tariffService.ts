import { supabase } from './supabase';

// ── Types ─────────────────────────────────────────────────

export interface TariffDetails {
  htsCode: string;
  treatmentApplied: string;
  mfnTextRate: string | null;
  applicableTextRate: string | null;
  rateTypeCode: string | null;
  rateTypeDescription: string;
  adValRate: number | null;
  specificRate: number | null;
  otherRate: number | null;
  isFree: boolean;
  specialProgramsText: string | null;
  quantity1Code: string | null;
  quantity2Code: string | null;
  additionalDutyFlags: string[];
  notes: string[];
}

interface CountryTreatment {
  primaryTreatment: string;
  ftaColumnPrefix: string | null;
  ftaIndicatorColumn: string | null;
  importProgramCode: string | null;
  gspEligible: boolean;
  agoaEligible: boolean;
  cbiEligible: boolean;
  cbtpaEligible: boolean;
  countryDisplayName: string | null;
  notes: string | null;
}

// ── Rate type descriptions ────────────────────────────────

const RATE_TYPE_DESCRIPTIONS: Record<string, string> = {
  '0': 'Free',
  '1': 'Specific rate per unit (Q1)',
  '2': 'Specific rate per unit (Q2)',
  '3': 'Compound: Specific (Q1) + Specific (Q2)',
  '4': 'Compound: Specific (Q1) + Ad Valorem',
  '5': 'Compound: Specific (Q2) + Ad Valorem',
  '6': 'Compound: Specific (Q1+Q2) + Ad Valorem',
  '7': 'Ad Valorem (% of value)',
  '9': 'Special — refer to HTS',
  'K': 'Special — refer to HTS',
  'X': 'Special — refer to HTS',
  'T': 'Compute at 10-digit level',
};

// ── FTA friendly names ────────────────────────────────────

const PROGRAM_NAMES: Record<string, string> = {
  usmca: 'USMCA',
  korea: 'Korea FTA (KORUS)',
  australia: 'US-Australia FTA',
  bahrain: 'US-Bahrain FTA',
  chile: 'US-Chile FTA',
  colombia: 'US-Colombia TPA',
  japan: 'US-Japan Trade Agreement',
  jordan: 'US-Jordan FTA',
  morocco: 'US-Morocco FTA',
  oman: 'US-Oman FTA',
  panama: 'US-Panama TPA',
  peru: 'US-Peru TPA',
  singapore: 'US-Singapore FTA',
  dr_cafta: 'DR-CAFTA',
};

// ── Helper: safe number extraction ────────────────────────

function toNum(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null;
  const n = Number(val);
  return isNaN(n) ? null : n;
}

// ── Step 1: Lookup tariff rates ───────────────────────────

async function lookupTariffRates(htsCode: string): Promise<Record<string, unknown> | null> {
  const cleanCode = htsCode.replace(/\./g, '');

  const { data, error } = await supabase
    .from('tariff_rates')
    .select('*')
    .eq('hts_code', cleanCode)
    .maybeSingle();

  if (error) {
    console.error('Tariff rates lookup error:', error);
    return null;
  }
  return data;
}

// ── Step 2: Get country treatment ─────────────────────────

async function getCountryTreatment(countryName: string): Promise<CountryTreatment | null> {
  // Join country_tariff_mapping with countries table, search by display_name
  const { data, error } = await supabase
    .from('country_tariff_mapping')
    .select('*, countries!inner(id, iso_alpha2, display_name)')
    .ilike('countries.display_name', countryName)
    .maybeSingle();

  // If exact match fails, try partial match
  if (!data && !error) {
    const { data: partial } = await supabase
      .from('country_tariff_mapping')
      .select('*, countries!inner(id, iso_alpha2, display_name)')
      .ilike('countries.display_name', `%${countryName}%`)
      .limit(1)
      .maybeSingle();

    if (partial) {
      return extractTreatment(partial);
    }
    return null;
  }

  if (error) {
    console.error('Country treatment lookup error:', error);
    return null;
  }

  return data ? extractTreatment(data) : null;
}

function extractTreatment(row: Record<string, unknown>): CountryTreatment {
  const countries = row.countries as Record<string, unknown> | null;
  return {
    primaryTreatment: (row.primary_treatment as string) || 'mfn',
    ftaColumnPrefix: row.fta_column_prefix as string | null,
    ftaIndicatorColumn: row.fta_indicator_column as string | null,
    importProgramCode: row.import_program_code as string | null,
    gspEligible: (row.gsp_eligible as boolean) || false,
    agoaEligible: (row.agoa_eligible as boolean) || false,
    cbiEligible: (row.cbi_eligible as boolean) || false,
    cbtpaEligible: (row.cbtpa_eligible as boolean) || false,
    countryDisplayName: countries?.display_name as string | null,
    notes: row.notes as string | null,
  };
}

// ── Step 3: Determine applicable rate ─────────────────────

interface ApplicableRate {
  treatment: string;
  rateTypeCode: string | null;
  adValRate: number | null;
  specificRate: number | null;
  otherRate: number | null;
  isFree: boolean;
}

function checkFtaRate(htsData: Record<string, unknown>, prefix: string): ApplicableRate | null {
  const indicatorVal = String(htsData[`${prefix}_indicator`] || '').trim().toUpperCase();
  if (!['Y', 'YES', '1'].includes(indicatorVal)) return null;

  const rateType = htsData[`${prefix}_rate_type_code`] as string | null;
  const adVal = toNum(htsData[`${prefix}_ad_val_rate`]);
  const specific = toNum(htsData[`${prefix}_specific_rate`]);
  const other = toNum(htsData[`${prefix}_other_rate`]);

  const isFree = rateType === '0' || (
    (adVal === null || adVal === 0) &&
    (specific === null || specific === 0) &&
    (other === null || other === 0)
  );

  return {
    treatment: PROGRAM_NAMES[prefix] || prefix.toUpperCase(),
    rateTypeCode: rateType,
    adValRate: adVal,
    specificRate: specific,
    otherRate: other,
    isFree,
  };
}

function determineApplicableRate(
  htsData: Record<string, unknown>,
  treatment: CountryTreatment | null
): ApplicableRate {
  const notes: string[] = [];

  // FTA check
  if (treatment?.primaryTreatment === 'fta') {
    if (treatment.ftaColumnPrefix) {
      const ftaRate = checkFtaRate(htsData, treatment.ftaColumnPrefix);
      if (ftaRate) return ftaRate;
    }
    // Indicator-only FTAs (Israel, Nepal)
    if (treatment.ftaIndicatorColumn) {
      const indVal = String(htsData[treatment.ftaIndicatorColumn] || '').trim().toUpperCase();
      if (['Y', 'YES', '1'].includes(indVal)) {
        return {
          treatment: `${treatment.countryDisplayName || ''} FTA (Free)`,
          rateTypeCode: '0',
          adValRate: 0,
          specificRate: 0,
          otherRate: 0,
          isFree: true,
        };
      }
    }
    // FTA didn't apply for this HTS — fall through to MFN
  }

  // Column 2
  if (treatment?.primaryTreatment === 'col2') {
    return {
      treatment: 'Column 2 (Non-NTR)',
      rateTypeCode: htsData.col2_rate_type_code as string | null,
      adValRate: toNum(htsData.col2_ad_val_rate),
      specificRate: toNum(htsData.col2_specific_rate),
      otherRate: toNum(htsData.col2_other_rate),
      isFree: false,
    };
  }

  // GSP check
  if (treatment?.gspEligible) {
    const gspInd = String(htsData.gsp_indicator || '').trim().toUpperCase();
    if (['Y', 'YES', '1'].includes(gspInd)) {
      return {
        treatment: 'GSP (Duty-Free)',
        rateTypeCode: '0',
        adValRate: 0,
        specificRate: 0,
        otherRate: 0,
        isFree: true,
      };
    }
  }

  // AGOA check
  if (treatment?.agoaEligible) {
    const agoaInd = String(htsData.agoa_indicator || '').trim().toUpperCase();
    if (['Y', 'YES', '1', 'D'].includes(agoaInd)) {
      return {
        treatment: 'AGOA (Duty-Free)',
        rateTypeCode: '0',
        adValRate: 0,
        specificRate: 0,
        otherRate: 0,
        isFree: true,
      };
    }
  }

  // CBI check
  if (treatment?.cbiEligible) {
    const cbiInd = String(htsData.cbi_indicator || '').trim().toUpperCase();
    if (['Y', 'YES', '1', 'E'].includes(cbiInd)) {
      const adVal = toNum(htsData.cbi_ad_val_rate);
      const specific = toNum(htsData.cbi_specific_rate);
      const isFree = (adVal === null || adVal === 0) && (specific === null || specific === 0);
      return {
        treatment: 'CBI (Caribbean Basin)',
        rateTypeCode: htsData.mfn_rate_type_code as string | null,
        adValRate: adVal,
        specificRate: specific,
        otherRate: null,
        isFree,
      };
    }
  }

  // CBTPA check
  if (treatment?.cbtpaEligible) {
    const cbtpaInd = String(htsData.cbtpa_indicator || '').trim().toUpperCase();
    if (['Y', 'YES', '1', 'R'].includes(cbtpaInd)) {
      const adVal = toNum(htsData.cbtpa_ad_val_rate);
      const specific = toNum(htsData.cbtpa_specific_rate);
      const isFree = (adVal === null || adVal === 0) && (specific === null || specific === 0);
      return {
        treatment: 'CBTPA (Caribbean Basin)',
        rateTypeCode: htsData.cbtpa_rate_type_code as string | null,
        adValRate: adVal,
        specificRate: specific,
        otherRate: null,
        isFree,
      };
    }
  }

  // Default: MFN
  const mfnRateType = htsData.mfn_rate_type_code as string | null;
  const mfnAdVal = toNum(htsData.mfn_ad_val_rate);
  const mfnSpecific = toNum(htsData.mfn_specific_rate);
  const mfnOther = toNum(htsData.mfn_other_rate);

  const isFree = mfnRateType === '0' || (
    (mfnAdVal === null || mfnAdVal === 0) &&
    (mfnSpecific === null || mfnSpecific === 0) &&
    (mfnOther === null || mfnOther === 0)
  );

  return {
    treatment: 'MFN (Most Favored Nation)',
    rateTypeCode: mfnRateType,
    adValRate: mfnAdVal,
    specificRate: mfnSpecific,
    otherRate: mfnOther,
    isFree,
  };
}

// ── Step 4: Additional duty flags ─────────────────────────

function getAdditionalDutyFlags(
  htsData: Record<string, unknown>,
  countryName?: string
): string[] {
  const flags: string[] = [];
  const cleanCode = String(htsData.hts_code || '');
  const chapter = cleanCode.substring(0, 2);

  // Section 301 (China)
  if (countryName?.toLowerCase() === 'china') {
    flags.push('Section 301 tariffs may apply (China origin) — verify current rates');
  }

  // Section 232 (Steel & Aluminum)
  if (['72', '73'].includes(chapter)) {
    flags.push('Section 232: 25% tariff on steel products may apply');
  } else if (chapter === '76') {
    flags.push('Section 232: 10% tariff on aluminum products may apply');
  }

  // Additional duty indicator from tariff_rates
  const additionalDuty = htsData.additional_duty as string | null;
  if (additionalDuty && additionalDuty.trim()) {
    flags.push(`Additional duty: ${additionalDuty}`);
  }

  return flags;
}

// ── Main: Get full tariff details ─────────────────────────

export async function getTariffDetails(
  htsCode: string,
  countryOfOrigin?: string
): Promise<TariffDetails | null> {
  // Step 1: Lookup HTS
  const htsData = await lookupTariffRates(htsCode);
  if (!htsData) return null;

  // Step 2: Get country treatment (if country provided)
  let treatment: CountryTreatment | null = null;
  if (countryOfOrigin) {
    treatment = await getCountryTreatment(countryOfOrigin);
  }

  // Step 3: Determine applicable rate
  const rate = determineApplicableRate(htsData, treatment);

  // Step 4: Additional duties
  const additionalFlags = getAdditionalDutyFlags(htsData, countryOfOrigin);

  // Build notes
  const notes: string[] = [];
  if (treatment?.notes) notes.push(treatment.notes);
  if (!treatment && countryOfOrigin) {
    notes.push(`Country "${countryOfOrigin}" not found in tariff mapping — showing MFN rates`);
  }

  return {
    htsCode: String(htsData.hts_code),
    treatmentApplied: rate.treatment,
    mfnTextRate: (htsData.mfn_text_rate as string) || null,
    applicableTextRate: rate.isFree ? 'Free' : null,
    rateTypeCode: rate.rateTypeCode,
    rateTypeDescription: RATE_TYPE_DESCRIPTIONS[rate.rateTypeCode || ''] || 'Unknown',
    adValRate: rate.adValRate,
    specificRate: rate.specificRate,
    otherRate: rate.otherRate,
    isFree: rate.isFree,
    specialProgramsText: (htsData.col1_special_text as string) || null,
    quantity1Code: (htsData.quantity_1_code as string) || null,
    quantity2Code: (htsData.quantity_2_code as string) || null,
    additionalDutyFlags: additionalFlags,
    notes,
  };
}
