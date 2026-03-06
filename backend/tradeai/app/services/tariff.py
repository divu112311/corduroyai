"""
Tariff Calculation Service

Calculates US import duty rates given an 8-digit HTS code and country of origin.
Uses Supabase tables: tariff_rates, country_tariff_mapping (joined with countries).

Adapted from backend/corduroyai/tariff_calculator.py for the FastAPI service.
"""

import os
from dataclasses import dataclass, field, asdict
from typing import Optional

import httpx

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_KEY", "")


# ── Data classes ───────────────────────────────────────────────

@dataclass
class CountryTreatment:
    """Result of looking up a country's tariff treatment."""
    country_name: str
    iso2_code: Optional[str] = None
    primary_treatment: str = "mfn"
    fta_column_prefix: Optional[str] = None
    fta_indicator_column: Optional[str] = None
    import_program_code: Optional[str] = None
    gsp_eligible: bool = False
    agoa_eligible: bool = False
    cbi_eligible: bool = False
    cbtpa_eligible: bool = False
    notes: Optional[str] = None


@dataclass
class RateInfo:
    """The applicable rate details for a specific HTS + country combination."""
    treatment_applied: str = ""
    rate_type_code: Optional[str] = None
    rate_type_description: Optional[str] = None
    ad_val_rate: Optional[float] = None
    specific_rate: Optional[float] = None
    other_rate: Optional[float] = None
    text_rate: Optional[str] = None
    is_free: bool = False
    needs_manual_review: bool = False
    notes: list = field(default_factory=list)


@dataclass
class DutyResult:
    """Full result of a tariff calculation."""
    hts_code: str = ""
    description: Optional[str] = None
    country: str = ""
    treatment_applied: str = ""
    rate_info: Optional[RateInfo] = None
    computed_duty: Optional[float] = None
    duty_formula: Optional[str] = None
    additional_duties: list = field(default_factory=list)
    total_duty: Optional[float] = None
    quantity_1_code: Optional[str] = None
    quantity_2_code: Optional[str] = None
    mfn_text_rate: Optional[str] = None
    col1_special_text: Optional[str] = None
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return asdict(self)


# ── Constants ──────────────────────────────────────────────────

RATE_TYPE_DESCRIPTIONS = {
    "0": "Free – no duty",
    "1": "Specific rate × Q1",
    "2": "Specific rate × Q2",
    "3": "(Specific rate × Q1) + (Other rate × Q2)",
    "4": "(Specific rate × Q1) + (Ad Valorem rate × Value)",
    "5": "(Specific rate × Q2) + (Ad Valorem rate × Value)",
    "6": "(Specific rate × Q1) + (Other rate × Q2) + (Ad Valorem rate × Value)",
    "7": "Ad Valorem rate × Value",
    "9": "Ad Valorem rate × Derived Duty (refer to HTS)",
    "K": "Refer to HTS for duty computation",
    "X": "Refer to HTS for duty computation",
    "T": "Compute at 10-digit level (refer to HTS)",
}

PROGRAM_NAMES = {
    "usmca": "USMCA",
    "korea": "Korea FTA (KORUS)",
    "australia": "US-Australia FTA",
    "bahrain": "US-Bahrain FTA",
    "chile": "US-Chile FTA",
    "colombia": "US-Colombia TPA",
    "japan": "US-Japan Trade Agreement",
    "jordan": "US-Jordan FTA",
    "morocco": "US-Morocco FTA",
    "oman": "US-Oman FTA",
    "panama": "US-Panama TPA",
    "peru": "US-Peru TPA",
    "singapore": "US-Singapore FTA",
    "dr_cafta": "DR-CAFTA",
    "dr_cafta_plus": "DR-CAFTA Plus",
    "mexico": "NAFTA (Mexico legacy)",
    "cbi": "Caribbean Basin Initiative (CBI)",
    "cbtpa": "Caribbean Basin Trade Partnership Act (CBTPA)",
    "atpa": "Andean Trade Preference Act (ATPA)",
}


# ── Tariff Calculator ─────────────────────────────────────────

class TariffCalculator:
    """
    Calculates US import duty for a given HTS code and country of origin.

    Steps:
      1. Lookup HTS code in tariff_rates
      2. Determine country treatment from country_tariff_mapping
      3. Find applicable rate (FTA > GSP/AGOA/CBI > MFN > Column 2)
      4. Compute duty amount if value/quantity provided
      5. Check additional duties (Section 301, 232, AD/CVD)
      6. Return result
    """

    def __init__(self, supabase_url: str = None, supabase_key: str = None):
        self.url = (supabase_url or SUPABASE_URL).rstrip("/")
        self.key = supabase_key or SUPABASE_KEY
        if not self.url or not self.key:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY must be set")
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
        }
        self.client = httpx.Client(timeout=30.0)

    def _query(self, table: str, params: dict) -> list[dict]:
        resp = self.client.get(
            f"{self.url}/rest/v1/{table}",
            headers=self.headers,
            params=params,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"Supabase query failed: {resp.status_code} {resp.text[:200]}")
        return resp.json()

    # ── Step 1: Lookup HTS code ────────────────────────────────

    def lookup_rates(self, hts_code: str) -> Optional[dict]:
        clean_code = hts_code.replace(".", "")
        rows = self._query("tariff_rates", {
            "hts_code": f"eq.{clean_code}",
            "select": "*",
        })
        if not rows:
            rows = self._query("tariff_rates", {
                "hts_code": f"eq.{hts_code}",
                "select": "*",
            })
        return rows[0] if rows else None

    # ── Step 2: Determine country treatment ────────────────────

    def get_country_treatment(self, country: str) -> CountryTreatment:
        select_cols = "*, countries!inner(id, iso_alpha2, display_name)"

        # Try by display_name first
        rows = self._query("country_tariff_mapping", {
            "select": select_cols,
            "countries.display_name": f"ilike.{country}",
        })

        # Try by iso_alpha2
        if not rows and len(country) == 2:
            rows = self._query("country_tariff_mapping", {
                "select": select_cols,
                "countries.iso_alpha2": f"eq.{country.upper()}",
            })

        # Try partial match
        if not rows:
            rows = self._query("country_tariff_mapping", {
                "select": select_cols,
                "countries.display_name": f"ilike.%{country}%",
            })

        if rows:
            r = rows[0]
            country_info = r.get("countries", {})
            return CountryTreatment(
                country_name=country_info.get("display_name", country),
                iso2_code=country_info.get("iso_alpha2"),
                primary_treatment=r.get("primary_treatment", "mfn"),
                fta_column_prefix=r.get("fta_column_prefix"),
                fta_indicator_column=r.get("fta_indicator_column"),
                import_program_code=r.get("import_program_code"),
                gsp_eligible=r.get("gsp_eligible", False),
                agoa_eligible=r.get("agoa_eligible", False),
                cbi_eligible=r.get("cbi_eligible", False),
                cbtpa_eligible=r.get("cbtpa_eligible", False),
                notes=r.get("notes"),
            )

        return CountryTreatment(
            country_name=country,
            primary_treatment="mfn",
            notes="Country not found in mapping; defaulting to MFN",
        )

    # ── Step 3: Determine applicable rate ──────────────────────

    def _extract_fta_rates(self, hts_data: dict, prefix: str) -> Optional[RateInfo]:
        indicator_col = f"{prefix}_indicator"
        indicator_val = hts_data.get(indicator_col)
        if not indicator_val or indicator_val.strip().upper() not in ("Y", "YES", "1"):
            return None

        rate_type = hts_data.get(f"{prefix}_rate_type_code")
        ad_val = hts_data.get(f"{prefix}_ad_val_rate")
        specific = hts_data.get(f"{prefix}_specific_rate")
        other = hts_data.get(f"{prefix}_other_rate")

        ad_val = float(ad_val) if ad_val is not None else None
        specific = float(specific) if specific is not None else None
        other = float(other) if other is not None else None

        is_free = (rate_type == "0") or (
            (ad_val is None or ad_val == 0) and
            (specific is None or specific == 0) and
            (other is None or other == 0)
        )

        program_name = PROGRAM_NAMES.get(prefix, prefix.upper())
        return RateInfo(
            treatment_applied=program_name,
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val,
            specific_rate=specific,
            other_rate=other,
            is_free=is_free,
            needs_manual_review=rate_type in ("9", "K", "X", "T"),
        )

    def _extract_mfn_rates(self, hts_data: dict) -> RateInfo:
        rate_type = hts_data.get("mfn_rate_type_code")
        ad_val = hts_data.get("mfn_ad_val_rate")
        specific = hts_data.get("mfn_specific_rate")
        other = hts_data.get("mfn_other_rate")
        text_rate = hts_data.get("mfn_text_rate")

        ad_val = float(ad_val) if ad_val is not None else None
        specific = float(specific) if specific is not None else None
        other = float(other) if other is not None else None

        is_free = (rate_type == "0") or (
            (ad_val is None or ad_val == 0) and
            (specific is None or specific == 0) and
            (other is None or other == 0)
        )

        return RateInfo(
            treatment_applied="MFN (Most Favored Nation)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val,
            specific_rate=specific,
            other_rate=other,
            text_rate=text_rate,
            is_free=is_free,
            needs_manual_review=rate_type in ("9", "K", "X", "T"),
        )

    def _extract_col2_rates(self, hts_data: dict) -> RateInfo:
        rate_type = hts_data.get("col2_rate_type_code")
        ad_val = hts_data.get("col2_ad_val_rate")
        specific = hts_data.get("col2_specific_rate")
        other = hts_data.get("col2_other_rate")
        text_rate = hts_data.get("col2_text_rate")

        ad_val = float(ad_val) if ad_val is not None else None
        specific = float(specific) if specific is not None else None
        other = float(other) if other is not None else None

        return RateInfo(
            treatment_applied="Column 2 (Non-NTR)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val,
            specific_rate=specific,
            other_rate=other,
            text_rate=text_rate,
            is_free=False,
            needs_manual_review=rate_type in ("9", "K", "X", "T"),
        )

    def _check_gsp(self, hts_data: dict, ct: CountryTreatment) -> Optional[RateInfo]:
        if not ct.gsp_eligible:
            return None
        gsp_ind = hts_data.get("gsp_indicator", "").strip().upper()
        if gsp_ind not in ("Y", "YES", "1"):
            return None
        excluded = hts_data.get("gsp_ctry_excluded", "") or ""
        iso2 = ct.iso2_code or ""
        if iso2 and iso2.upper() in excluded.upper():
            return None
        return RateInfo(
            treatment_applied="GSP (Generalized System of Preferences)",
            rate_type_code="0",
            rate_type_description="Free – GSP duty-free treatment",
            ad_val_rate=0, specific_rate=0, other_rate=0, is_free=True,
        )

    def _check_agoa(self, hts_data: dict, ct: CountryTreatment) -> Optional[RateInfo]:
        if not ct.agoa_eligible:
            return None
        agoa_ind = hts_data.get("agoa_indicator", "").strip().upper()
        if agoa_ind not in ("Y", "YES", "1", "D"):
            return None
        return RateInfo(
            treatment_applied="AGOA (African Growth and Opportunity Act)",
            rate_type_code="0",
            rate_type_description="Free – AGOA duty-free treatment",
            ad_val_rate=0, specific_rate=0, other_rate=0, is_free=True,
        )

    def _check_cbi(self, hts_data: dict, ct: CountryTreatment) -> Optional[RateInfo]:
        if not ct.cbi_eligible:
            return None
        cbi_ind = hts_data.get("cbi_indicator", "").strip().upper()
        if cbi_ind not in ("Y", "YES", "1", "E"):
            return None
        rate_type = hts_data.get("mfn_rate_type_code")
        ad_val = float(hts_data.get("cbi_ad_val_rate") or 0)
        specific = float(hts_data.get("cbi_specific_rate") or 0)
        is_free = (ad_val == 0 and specific == 0)
        return RateInfo(
            treatment_applied="CBI (Caribbean Basin Initiative)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val, specific_rate=specific, is_free=is_free,
        )

    def _check_cbtpa(self, hts_data: dict, ct: CountryTreatment) -> Optional[RateInfo]:
        if not ct.cbtpa_eligible:
            return None
        cbtpa_ind = hts_data.get("cbtpa_indicator", "").strip().upper()
        if cbtpa_ind not in ("Y", "YES", "1", "R"):
            return None
        rate_type = hts_data.get("cbtpa_rate_type_code")
        ad_val = float(hts_data.get("cbtpa_ad_val_rate") or 0)
        specific = float(hts_data.get("cbtpa_specific_rate") or 0)
        is_free = (rate_type == "0") or (ad_val == 0 and specific == 0)
        return RateInfo(
            treatment_applied="CBTPA (Caribbean Basin Trade Partnership Act)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val, specific_rate=specific, is_free=is_free,
        )

    def determine_applicable_rate(self, hts_data: dict, ct: CountryTreatment) -> RateInfo:
        notes = []

        # FTA check
        if ct.primary_treatment == "fta" and ct.fta_column_prefix:
            fta_rate = self._extract_fta_rates(hts_data, ct.fta_column_prefix)
            if fta_rate:
                return fta_rate
            else:
                prefix = ct.fta_column_prefix
                program_name = PROGRAM_NAMES.get(prefix, prefix.upper())
                notes.append(f"{program_name} indicator not set for this HTS; falling through to MFN")

        # Israel and Nepal: indicator-only FTAs
        if ct.primary_treatment == "fta" and ct.fta_indicator_column:
            ind_col = ct.fta_indicator_column
            ind_val = (hts_data.get(ind_col, "") or "").strip().upper()
            if ind_val in ("Y", "YES", "1"):
                return RateInfo(
                    treatment_applied=f"{ct.country_name} FTA (Free)",
                    rate_type_code="0",
                    rate_type_description="Free – FTA duty-free treatment",
                    ad_val_rate=0, specific_rate=0, other_rate=0, is_free=True,
                )

        # Column 2
        if ct.primary_treatment == "col2":
            return self._extract_col2_rates(hts_data)

        # Special programs
        for check in (self._check_gsp, self._check_agoa, self._check_cbi, self._check_cbtpa):
            rate = check(hts_data, ct)
            if rate:
                return rate

        # Default: MFN
        mfn_rate = self._extract_mfn_rates(hts_data)
        mfn_rate.notes = notes
        return mfn_rate

    # ── Step 4: Compute duty amount ────────────────────────────

    def compute_duty(self, rate_info: RateInfo, value=None, quantity_1=None, quantity_2=None):
        code = rate_info.rate_type_code
        if not code:
            return None, None

        ad_val = rate_info.ad_val_rate or 0
        specific = rate_info.specific_rate or 0
        other = rate_info.other_rate or 0

        if code == "0":
            return 0.0, "Free (duty = $0.00)"
        if code == "1" and quantity_1 is not None:
            duty = specific * quantity_1
            return duty, f"Specific({specific}) × Q1({quantity_1}) = ${duty:.2f}"
        if code == "2" and quantity_2 is not None:
            duty = specific * quantity_2
            return duty, f"Specific({specific}) × Q2({quantity_2}) = ${duty:.2f}"
        if code == "3" and quantity_1 is not None and quantity_2 is not None:
            duty = (specific * quantity_1) + (other * quantity_2)
            return duty, f"Specific({specific})×Q1({quantity_1}) + Other({other})×Q2({quantity_2}) = ${duty:.2f}"
        if code == "4" and quantity_1 is not None and value is not None:
            duty = (specific * quantity_1) + (ad_val * value)
            return duty, f"Specific({specific})×Q1({quantity_1}) + AdVal({ad_val})×Value({value}) = ${duty:.2f}"
        if code == "5" and quantity_2 is not None and value is not None:
            duty = (specific * quantity_2) + (ad_val * value)
            return duty, f"Specific({specific})×Q2({quantity_2}) + AdVal({ad_val})×Value({value}) = ${duty:.2f}"
        if code == "6" and quantity_1 is not None and quantity_2 is not None and value is not None:
            duty = (specific * quantity_1) + (other * quantity_2) + (ad_val * value)
            return duty, f"Compound: ${duty:.2f}"
        if code == "7" and value is not None:
            duty = ad_val * value
            return duty, f"AdVal({ad_val}) × Value({value}) = ${duty:.2f}"

        return None, f"Rate type '{code}': {RATE_TYPE_DESCRIPTIONS.get(code, 'Unknown')}"

    # ── Step 5: Additional duties ──────────────────────────────

    def check_additional_duties(self, hts_code: str, country: str) -> list[dict]:
        additional = []
        clean_code = hts_code.replace(".", "")
        chapter = clean_code[:2] if len(clean_code) >= 2 else ""

        if country.lower() == "china":
            additional.append({
                "type": "Section 301",
                "description": "China Section 301 tariffs may apply (7.5% - 100% depending on List and product)",
                "rate": None,
                "status": "check_required",
            })

        if chapter in ("72", "73"):
            additional.append({
                "type": "Section 232",
                "description": "Section 232 tariff on steel products: 25%",
                "rate": 0.25,
                "status": "likely_applicable",
            })
        elif chapter == "76":
            additional.append({
                "type": "Section 232",
                "description": "Section 232 tariff on aluminum products: 10%",
                "rate": 0.10,
                "status": "likely_applicable",
            })

        return additional

    # ── Step 6: Full calculation pipeline ──────────────────────

    def calculate(self, hts_code: str, country: str, value=None, quantity_1=None, quantity_2=None) -> DutyResult:
        result = DutyResult(hts_code=hts_code, country=country)

        hts_data = self.lookup_rates(hts_code)
        if not hts_data:
            result.notes.append(f"HTS code {hts_code} not found in tariff_rates")
            return result

        result.description = hts_data.get("brief_description")
        result.quantity_1_code = hts_data.get("quantity_1_code")
        result.quantity_2_code = hts_data.get("quantity_2_code")
        result.mfn_text_rate = hts_data.get("mfn_text_rate")
        result.col1_special_text = hts_data.get("col1_special_text")

        country_treatment = self.get_country_treatment(country)
        if country_treatment.notes:
            result.notes.append(country_treatment.notes)

        rate_info = self.determine_applicable_rate(hts_data, country_treatment)
        result.rate_info = rate_info
        result.treatment_applied = rate_info.treatment_applied

        computed, formula = self.compute_duty(rate_info, value, quantity_1, quantity_2)
        result.computed_duty = computed
        result.duty_formula = formula

        result.additional_duties = self.check_additional_duties(hts_code, country)

        if computed is not None:
            additional_total = sum(
                (d.get("rate", 0) or 0) * (value or 0)
                for d in result.additional_duties
                if d.get("rate") is not None and d.get("status") == "likely_applicable"
            )
            result.total_duty = computed + additional_total

        return result

    def close(self):
        self.client.close()
