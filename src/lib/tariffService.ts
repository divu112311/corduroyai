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
  // MFN pass-through for FTA savings calculation
  _mfnAdValRate?: number | null;
  _mfnSpecificRate?: number | null;
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
  console.log('[tariff] Looking up HTS (original):', htsCode);

  // Try with original format first — DB stores codes WITH dots (e.g., "6109.10.00")
  let { data, error } = await supabase
    .from('tariff_rates')
    .select('*')
    .eq('hts_code', htsCode)
    .maybeSingle();

  // If not found, try converting to dotted format: 61091000 → 6109.10.00
  if (!data && !error) {
    const clean = htsCode.replace(/\./g, '');
    // Truncate to 8 digits if longer (10-digit statistical suffix)
    const code8 = clean.length > 8 ? clean.substring(0, 8) : clean.length === 6 ? clean + '00' : clean;
    if (code8.length === 8) {
      const dotted = `${code8.slice(0, 4)}.${code8.slice(4, 6)}.${code8.slice(6, 8)}`;
      if (dotted !== htsCode) {
        console.log('[tariff] Retrying with dotted format:', dotted);
        ({ data, error } = await supabase
          .from('tariff_rates')
          .select('*')
          .eq('hts_code', dotted)
          .maybeSingle());
      }
    }
  }

  console.log('[tariff] HTS lookup result:', data ? 'found' : 'not found', error ? `error: ${error.message}` : 'no error');

  if (error) {
    console.error('Tariff rates lookup error:', error);
    return null;
  }
  return data;
}

// ── Step 2: Get country treatment ─────────────────────────

async function getCountryTreatment(countryName: string): Promise<CountryTreatment | null> {
  console.log('[tariff] Looking up country treatment for:', countryName);
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
    // Pass through MFN rates for savings calculation
    _mfnAdValRate: toNum(htsData.mfn_ad_val_rate),
    _mfnSpecificRate: toNum(htsData.mfn_specific_rate),
  };
}


// ── Duty Estimate (display-ready computation) ────────────

export interface DutyLine {
  label: string;
  rateDisplay: string;
  amount: number | null;
}

export interface DutyEstimate {
  mode: 'free' | 'calculated' | 'rate_only' | 'needs_quantity';
  treatmentName: string;
  treatmentShort: string;
  isFree: boolean;
  dutyLines: DutyLine[];
  totalRate: string | null;
  totalDuty: number | null;
  totalLandedCost: number | null;
  savingsAmount: number | null;
  savingsRateDisplay: string | null;
  needsQuantity: boolean;
  quantityUnit: string | null;
  quantityLabel: string | null;
}

// ── Unit code → human label ──────────────────────────────

const UNIT_LABELS: Record<string, string> = {
  KG: 'kg',
  DOZ: 'dozen',
  NO: 'units',
  'NO.': 'units',
  PCS: 'pieces',
  M2: 'm²',
  M: 'meters',
  LTR: 'liters',
  L: 'liters',
  T: 'metric tons',
  GRS: 'gross',
  BBL: 'barrels',
  'M3': 'm³',
};

function unitLabel(code: string | null): string | null {
  if (!code) return null;
  return UNIT_LABELS[code.toUpperCase().trim()] || code.toLowerCase();
}

// ── Treatment name cleanup ───────────────────────────────

function cleanTreatmentName(raw: string): { name: string; short: string } {
  if (raw.includes('MFN') || raw.includes('Most Favored')) {
    return { name: 'Standard Rate', short: 'MFN' };
  }
  if (raw.includes('USMCA')) return { name: 'USMCA', short: 'USMCA' };
  if (raw.includes('KORUS') || raw.includes('Korea FTA')) return { name: 'Korea FTA (KORUS)', short: 'KORUS' };
  if (raw.includes('GSP')) return { name: 'GSP', short: 'GSP' };
  if (raw.includes('AGOA')) return { name: 'AGOA', short: 'AGOA' };
  if (raw.includes('CBI')) return { name: 'CBI', short: 'CBI' };
  if (raw.includes('CBTPA')) return { name: 'CBTPA', short: 'CBTPA' };
  if (raw.includes('Column 2')) return { name: 'Column 2', short: 'Col 2' };
  if (raw.includes('Australia')) return { name: 'US-Australia FTA', short: 'AUSFTA' };
  if (raw.includes('Chile')) return { name: 'US-Chile FTA', short: 'Chile FTA' };
  if (raw.includes('Colombia')) return { name: 'US-Colombia TPA', short: 'Colombia' };
  if (raw.includes('Japan')) return { name: 'US-Japan Trade Agreement', short: 'Japan' };
  if (raw.includes('Singapore')) return { name: 'US-Singapore FTA', short: 'Singapore' };
  if (raw.includes('Panama')) return { name: 'US-Panama TPA', short: 'Panama' };
  if (raw.includes('Peru')) return { name: 'US-Peru TPA', short: 'Peru' };
  if (raw.includes('Jordan')) return { name: 'US-Jordan FTA', short: 'Jordan' };
  if (raw.includes('Morocco')) return { name: 'US-Morocco FTA', short: 'Morocco' };
  if (raw.includes('Bahrain')) return { name: 'US-Bahrain FTA', short: 'Bahrain' };
  if (raw.includes('Oman')) return { name: 'US-Oman FTA', short: 'Oman' };
  if (raw.includes('DR-CAFTA') || raw.includes('CAFTA')) return { name: 'DR-CAFTA', short: 'CAFTA' };
  if (raw.includes('Israel')) return { name: 'US-Israel FTA', short: 'Israel' };
  // Fallback
  const short = raw.length > 12 ? raw.substring(0, 10) + '…' : raw;
  return { name: raw, short };
}

// ── Format rate for display ──────────────────────────────

function formatRate(adVal: number | null, specific: number | null, qtyUnit: string | null, mfnText: string | null): string {
  if (adVal !== null && adVal > 0 && specific !== null && specific > 0) {
    // Compound
    const pct = (adVal * 100).toFixed(1).replace(/\.0$/, '');
    const specDisplay = specific < 1 ? `${(specific * 100).toFixed(1)}¢` : `$${specific.toFixed(2)}`;
    return `${pct}% + ${specDisplay}/${qtyUnit || 'unit'}`;
  }
  if (adVal !== null && adVal > 0) {
    return `${(adVal * 100).toFixed(1).replace(/\.0$/, '')}%`;
  }
  if (specific !== null && specific > 0) {
    if (specific < 0.01) {
      return `${(specific * 100).toFixed(2)}¢/${qtyUnit || 'unit'}`;
    } else if (specific < 1) {
      return `${(specific * 100).toFixed(1)}¢/${qtyUnit || 'unit'}`;
    }
    return `$${specific.toFixed(2)}/${qtyUnit || 'unit'}`;
  }
  // Fallback to raw text
  return mfnText || 'See HTS schedule';
}

// ── Main: Compute duty estimate ──────────────────────────

export function computeDutyEstimate(
  tariff: TariffDetails,
  productValue: number | null,
  quantity: number | null,
  countryOfOrigin?: string
): DutyEstimate {
  const { name: treatmentName, short: treatmentShort } = cleanTreatmentName(tariff.treatmentApplied);
  const qtyUnit = unitLabel(tariff.quantity1Code) || unitLabel(tariff.quantity2Code);
  const rateCode = tariff.rateTypeCode;

  // Determine if we need quantity
  const isSpecificOnly = (rateCode === '1' || rateCode === '2') && (tariff.adValRate === null || tariff.adValRate === 0);
  const isCompound = ['3', '4', '5', '6'].includes(rateCode || '');
  const needsQuantity = (isSpecificOnly || isCompound) && !tariff.isFree;

  // ── Calculate base duty ────────────────────────────────
  let baseDuty: number | null = null;
  if (tariff.isFree) {
    baseDuty = 0;
  } else if (tariff.adValRate !== null && tariff.adValRate > 0 && productValue !== null) {
    baseDuty = tariff.adValRate * productValue;
    if (isCompound && tariff.specificRate && quantity !== null) {
      baseDuty += tariff.specificRate * quantity;
    }
  } else if (tariff.specificRate !== null && tariff.specificRate > 0 && quantity !== null) {
    baseDuty = tariff.specificRate * quantity;
  }

  // ── Build duty lines ───────────────────────────────────
  const dutyLines: DutyLine[] = [];
  const rateDisplay = tariff.isFree ? 'Free' : formatRate(tariff.adValRate, tariff.specificRate, qtyUnit, tariff.mfnTextRate);

  dutyLines.push({
    label: 'Base Duty',
    rateDisplay: rateDisplay,
    amount: baseDuty,
  });

  // Additional duties (definitive — no "may apply")
  const htsClean = tariff.htsCode.replace(/\./g, '');
  const chapter = htsClean.substring(0, 2);
  let additionalTotal = 0;

  if (countryOfOrigin?.toLowerCase() === 'china') {
    const s301Rate = 0.25;
    const s301Amount = productValue !== null ? s301Rate * productValue : null;
    if (s301Amount !== null) additionalTotal += s301Amount;
    dutyLines.push({
      label: 'Section 301 (China)',
      rateDisplay: '+25%',
      amount: s301Amount,
    });
  }

  if (['72', '73'].includes(chapter)) {
    const s232Rate = 0.25;
    const s232Amount = productValue !== null ? s232Rate * productValue : null;
    if (s232Amount !== null) additionalTotal += s232Amount;
    dutyLines.push({
      label: 'Section 232 (Steel)',
      rateDisplay: '+25%',
      amount: s232Amount,
    });
  } else if (chapter === '76') {
    const s232Rate = 0.10;
    const s232Amount = productValue !== null ? s232Rate * productValue : null;
    if (s232Amount !== null) additionalTotal += s232Amount;
    dutyLines.push({
      label: 'Section 232 (Aluminum)',
      rateDisplay: '+10%',
      amount: s232Amount,
    });
  }

  // ── Totals ─────────────────────────────────────────────
  const totalDuty = baseDuty !== null ? baseDuty + additionalTotal : null;
  const totalLandedCost = totalDuty !== null && productValue !== null ? productValue + totalDuty : null;

  // Total rate display (only for ad valorem with multiple lines)
  let totalRate: string | null = null;
  if (dutyLines.length > 1 && tariff.adValRate !== null && tariff.adValRate > 0) {
    let combinedPct = tariff.adValRate * 100;
    if (countryOfOrigin?.toLowerCase() === 'china') combinedPct += 25;
    if (['72', '73'].includes(chapter)) combinedPct += 25;
    else if (chapter === '76') combinedPct += 10;
    totalRate = `${combinedPct.toFixed(1).replace(/\.0$/, '')}%`;
  }

  // ── FTA savings ────────────────────────────────────────
  let savingsAmount: number | null = null;
  let savingsRateDisplay: string | null = null;

  if (!treatmentShort.includes('MFN') && !treatmentShort.includes('Col 2')) {
    const mfnAdVal = tariff._mfnAdValRate ?? null;
    const mfnSpecific = tariff._mfnSpecificRate ?? null;
    if (mfnAdVal !== null && mfnAdVal > 0 && productValue !== null) {
      const mfnDuty = mfnAdVal * productValue;
      const actualDuty = baseDuty ?? 0;
      if (mfnDuty > actualDuty) {
        savingsAmount = mfnDuty - actualDuty;
        savingsRateDisplay = `${(mfnAdVal * 100).toFixed(1).replace(/\.0$/, '')}%`;
      }
    } else if (mfnAdVal !== null && mfnAdVal > 0) {
      // No product value, but we can still show the rate savings
      savingsRateDisplay = `${(mfnAdVal * 100).toFixed(1).replace(/\.0$/, '')}%`;
    }
  }

  // ── Mode ───────────────────────────────────────────────
  let mode: DutyEstimate['mode'];
  if (tariff.isFree) {
    mode = 'free';
  } else if (totalDuty !== null) {
    mode = 'calculated';
  } else if (needsQuantity && quantity === null) {
    mode = 'needs_quantity';
  } else {
    mode = 'rate_only';
  }

  return {
    mode,
    treatmentName,
    treatmentShort,
    isFree: tariff.isFree,
    dutyLines,
    totalRate,
    totalDuty,
    totalLandedCost,
    savingsAmount,
    savingsRateDisplay,
    needsQuantity,
    quantityUnit: qtyUnit,
    quantityLabel: needsQuantity ? `Enter quantity in ${qtyUnit || 'units'} to calculate exact duty` : null,
  };
}
