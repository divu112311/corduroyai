"""
Tariff Calculation Engine

Calculates US import duty rates given an 8-digit HTS code and country of origin.
Uses Supabase tables: tariff_rates, country_tariff_mapping, tariff_rate_types,
tariff_gsp_excluded.

Run standalone:
  py backend/corduroyai/tariff_calculator.py --hts 8471.30.01 --country "South Korea"
  py backend/corduroyai/tariff_calculator.py --hts 6109.10.00 --country China --value 5000

Requires SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_ROLE_KEY) in backend/.env
"""

import json
import os
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import Optional

import httpx
from dotenv import load_dotenv

# Load env
env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(env_path)

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.getenv("SUPABASE_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")


# ── Data classes ───────────────────────────────────────────────

@dataclass
class CountryTreatment:
    """Result of looking up a country's tariff treatment."""
    country_name: str
    iso2_code: Optional[str] = None
    primary_treatment: str = "mfn"  # 'fta', 'mfn', 'col2'
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
    treatment_applied: str = ""       # e.g., "USMCA", "Korea FTA", "MFN", "GSP (Free)", "Column 2"
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

    # Computed duty (only if value/qty provided)
    computed_duty: Optional[float] = None
    duty_formula: Optional[str] = None

    # Additional duties (Phase 2 placeholder)
    additional_duties: list = field(default_factory=list)
    total_duty: Optional[float] = None

    # Metadata
    quantity_1_code: Optional[str] = None
    quantity_2_code: Optional[str] = None
    mfn_text_rate: Optional[str] = None
    col1_special_text: Optional[str] = None
    notes: list = field(default_factory=list)

    def to_dict(self) -> dict:
        d = asdict(self)
        return d


# ── Rate Type Code descriptions ───────────────────────────────

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

# ── Import program friendly names ─────────────────────────────

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
      5. (Phase 2) Check additional duties (Section 301, 232, AD/CVD)
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
        """Query Supabase REST API and return rows."""
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
        """Get all rate data for an 8-digit HTS code."""
        # DB stores codes WITH dots (e.g., "6109.10.00") — try original first
        rows = self._query("tariff_rates", {
            "hts_code": f"eq.{hts_code}",
            "select": "*",
        })

        # If not found, try converting to dotted format: 61091000 → 6109.10.00
        if not rows:
            clean = hts_code.replace(".", "")
            if len(clean) > 8:
                clean = clean[:8]
            elif len(clean) == 6:
                clean = clean + "00"
            if len(clean) == 8:
                dotted = f"{clean[:4]}.{clean[4:6]}.{clean[6:8]}"
                if dotted != hts_code:
                    rows = self._query("tariff_rates", {
                        "hts_code": f"eq.{dotted}",
                        "select": "*",
                    })

        return rows[0] if rows else None

    # ── Step 2: Determine country treatment ────────────────────

    def get_country_treatment(self, country: str) -> CountryTreatment:
        """
        Look up country's tariff treatment from country_tariff_mapping
        joined with countries table.

        Accepts either display_name (e.g., "South Korea") or iso_alpha2 (e.g., "KR").
        """
        # Join country_tariff_mapping with countries table
        select_cols = "*, countries!inner(id, iso_alpha2, display_name)"

        # Try by display_name first
        rows = self._query("country_tariff_mapping", {
            "select": select_cols,
            "countries.display_name": f"ilike.{country}",
        })

        # If not found, try by iso_alpha2 (case-insensitive)
        if not rows and len(country) == 2:
            rows = self._query("country_tariff_mapping", {
                "select": select_cols,
                "countries.iso_alpha2": f"eq.{country.upper()}",
            })

        # If still not found, try partial match on display_name
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

        # Country not in mapping → default to MFN
        return CountryTreatment(
            country_name=country,
            primary_treatment="mfn",
            notes="Country not found in mapping; defaulting to MFN",
        )

    # ── Step 3: Determine applicable rate ──────────────────────

    def _extract_fta_rates(self, hts_data: dict, prefix: str) -> Optional[RateInfo]:
        """Extract FTA rate columns from tariff_rates row using column prefix."""
        indicator_col = f"{prefix}_indicator"
        indicator_val = hts_data.get(indicator_col)

        # Check if FTA applies for this HTS code
        if not indicator_val or indicator_val.strip().upper() not in ("Y", "YES", "1"):
            return None

        rate_type = hts_data.get(f"{prefix}_rate_type_code")
        ad_val = hts_data.get(f"{prefix}_ad_val_rate")
        specific = hts_data.get(f"{prefix}_specific_rate")
        other = hts_data.get(f"{prefix}_other_rate")

        # Convert to float safely
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
        """Extract MFN (Most Favored Nation) rates."""
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
        """Extract Column 2 rates."""
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

    def _check_gsp(self, hts_data: dict, country_treatment: CountryTreatment) -> Optional[RateInfo]:
        """Check if GSP (Generalized System of Preferences) applies."""
        if not country_treatment.gsp_eligible:
            return None

        gsp_ind = hts_data.get("gsp_indicator", "").strip().upper()
        if gsp_ind not in ("Y", "YES", "1"):
            return None

        # Check if country is excluded for this HTS
        excluded = hts_data.get("gsp_ctry_excluded", "") or ""
        iso2 = country_treatment.iso2_code or ""
        if iso2 and iso2.upper() in excluded.upper():
            return None

        return RateInfo(
            treatment_applied="GSP (Generalized System of Preferences)",
            rate_type_code="0",
            rate_type_description="Free – GSP duty-free treatment",
            ad_val_rate=0,
            specific_rate=0,
            other_rate=0,
            is_free=True,
        )

    def _check_agoa(self, hts_data: dict, country_treatment: CountryTreatment) -> Optional[RateInfo]:
        """Check if AGOA (African Growth and Opportunity Act) applies."""
        if not country_treatment.agoa_eligible:
            return None

        agoa_ind = hts_data.get("agoa_indicator", "").strip().upper()
        if agoa_ind not in ("Y", "YES", "1", "D"):
            return None

        return RateInfo(
            treatment_applied="AGOA (African Growth and Opportunity Act)",
            rate_type_code="0",
            rate_type_description="Free – AGOA duty-free treatment",
            ad_val_rate=0,
            specific_rate=0,
            other_rate=0,
            is_free=True,
        )

    def _check_cbi(self, hts_data: dict, country_treatment: CountryTreatment) -> Optional[RateInfo]:
        """Check if CBI (Caribbean Basin Initiative) applies."""
        if not country_treatment.cbi_eligible:
            return None

        cbi_ind = hts_data.get("cbi_indicator", "").strip().upper()
        if cbi_ind not in ("Y", "YES", "1", "E"):
            return None

        # CBI has its own rate columns
        rate_type = hts_data.get("mfn_rate_type_code")  # CBI uses similar computation
        ad_val = hts_data.get("cbi_ad_val_rate")
        specific = hts_data.get("cbi_specific_rate")

        ad_val = float(ad_val) if ad_val is not None else 0
        specific = float(specific) if specific is not None else 0

        is_free = (ad_val == 0 and specific == 0)

        return RateInfo(
            treatment_applied="CBI (Caribbean Basin Initiative)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val,
            specific_rate=specific,
            is_free=is_free,
        )

    def _check_cbtpa(self, hts_data: dict, country_treatment: CountryTreatment) -> Optional[RateInfo]:
        """Check if CBTPA (Caribbean Basin Trade Partnership Act) applies."""
        if not country_treatment.cbtpa_eligible:
            return None

        cbtpa_ind = hts_data.get("cbtpa_indicator", "").strip().upper()
        if cbtpa_ind not in ("Y", "YES", "1", "R"):
            return None

        rate_type = hts_data.get("cbtpa_rate_type_code")
        ad_val = hts_data.get("cbtpa_ad_val_rate")
        specific = hts_data.get("cbtpa_specific_rate")

        ad_val = float(ad_val) if ad_val is not None else 0
        specific = float(specific) if specific is not None else 0

        is_free = (rate_type == "0") or (ad_val == 0 and specific == 0)

        return RateInfo(
            treatment_applied="CBTPA (Caribbean Basin Trade Partnership Act)",
            rate_type_code=rate_type,
            rate_type_description=RATE_TYPE_DESCRIPTIONS.get(rate_type, "Unknown"),
            ad_val_rate=ad_val,
            specific_rate=specific,
            is_free=is_free,
        )

    def determine_applicable_rate(self, hts_data: dict, country_treatment: CountryTreatment) -> RateInfo:
        """
        Step 3: Determine the best applicable rate.
        Priority: FTA > GSP/AGOA > CBI/CBTPA > MFN > Column 2
        """
        notes = []

        # ── FTA check ──────────────────────────────────────────
        if country_treatment.primary_treatment == "fta" and country_treatment.fta_column_prefix:
            fta_rate = self._extract_fta_rates(hts_data, country_treatment.fta_column_prefix)
            if fta_rate:
                return fta_rate
            else:
                prefix = country_treatment.fta_column_prefix
                program_name = PROGRAM_NAMES.get(prefix, prefix.upper())
                notes.append(f"{program_name} indicator not set for this HTS; falling through to MFN")

        # Israel and Nepal: indicator-only FTAs (no rate columns)
        if country_treatment.primary_treatment == "fta" and country_treatment.fta_indicator_column:
            ind_col = country_treatment.fta_indicator_column
            ind_val = (hts_data.get(ind_col, "") or "").strip().upper()
            if ind_val in ("Y", "YES", "1"):
                return RateInfo(
                    treatment_applied=f"{country_treatment.country_name} FTA (Free)",
                    rate_type_code="0",
                    rate_type_description="Free – FTA duty-free treatment",
                    ad_val_rate=0,
                    specific_rate=0,
                    other_rate=0,
                    is_free=True,
                )

        # ── Column 2 check ─────────────────────────────────────
        if country_treatment.primary_treatment == "col2":
            rate = self._extract_col2_rates(hts_data)
            return rate

        # ── Special programs (GSP > AGOA > CBI > CBTPA) ───────
        gsp_rate = self._check_gsp(hts_data, country_treatment)
        if gsp_rate:
            return gsp_rate

        agoa_rate = self._check_agoa(hts_data, country_treatment)
        if agoa_rate:
            return agoa_rate

        cbi_rate = self._check_cbi(hts_data, country_treatment)
        if cbi_rate:
            return cbi_rate

        cbtpa_rate = self._check_cbtpa(hts_data, country_treatment)
        if cbtpa_rate:
            return cbtpa_rate

        # ── Default: MFN ───────────────────────────────────────
        mfn_rate = self._extract_mfn_rates(hts_data)
        mfn_rate.notes = notes
        return mfn_rate

    # ── Step 4: Compute duty amount ────────────────────────────

    def compute_duty(
        self,
        rate_info: RateInfo,
        value: Optional[float] = None,
        quantity_1: Optional[float] = None,
        quantity_2: Optional[float] = None,
    ) -> tuple[Optional[float], Optional[str]]:
        """
        Compute duty amount based on rate_type_code.
        Returns (duty_amount, formula_description) or (None, None) if can't compute.
        """
        code = rate_info.rate_type_code
        if not code:
            return None, None

        ad_val = rate_info.ad_val_rate or 0
        specific = rate_info.specific_rate or 0
        other = rate_info.other_rate or 0

        if code == "0":
            return 0.0, "Free (duty = $0.00)"

        if code == "1":
            if quantity_1 is not None:
                duty = specific * quantity_1
                return duty, f"Specific({specific}) × Q1({quantity_1}) = ${duty:.2f}"
            return None, "Need quantity_1 (Q1) to compute: Specific rate × Q1"

        if code == "2":
            if quantity_2 is not None:
                duty = specific * quantity_2
                return duty, f"Specific({specific}) × Q2({quantity_2}) = ${duty:.2f}"
            return None, "Need quantity_2 (Q2) to compute: Specific rate × Q2"

        if code == "3":
            if quantity_1 is not None and quantity_2 is not None:
                duty = (specific * quantity_1) + (other * quantity_2)
                return duty, f"Specific({specific})×Q1({quantity_1}) + Other({other})×Q2({quantity_2}) = ${duty:.2f}"
            return None, "Need Q1 and Q2 to compute: (Specific×Q1) + (Other×Q2)"

        if code == "4":
            if quantity_1 is not None and value is not None:
                duty = (specific * quantity_1) + (ad_val * value)
                return duty, f"Specific({specific})×Q1({quantity_1}) + AdVal({ad_val})×Value({value}) = ${duty:.2f}"
            return None, "Need Q1 and Value to compute: (Specific×Q1) + (Ad Valorem×Value)"

        if code == "5":
            if quantity_2 is not None and value is not None:
                duty = (specific * quantity_2) + (ad_val * value)
                return duty, f"Specific({specific})×Q2({quantity_2}) + AdVal({ad_val})×Value({value}) = ${duty:.2f}"
            return None, "Need Q2 and Value to compute: (Specific×Q2) + (Ad Valorem×Value)"

        if code == "6":
            if quantity_1 is not None and quantity_2 is not None and value is not None:
                duty = (specific * quantity_1) + (other * quantity_2) + (ad_val * value)
                return duty, (
                    f"Specific({specific})×Q1({quantity_1}) + Other({other})×Q2({quantity_2}) "
                    f"+ AdVal({ad_val})×Value({value}) = ${duty:.2f}"
                )
            return None, "Need Q1, Q2, and Value to compute compound duty"

        if code == "7":
            if value is not None:
                duty = ad_val * value
                return duty, f"AdVal({ad_val}) × Value({value}) = ${duty:.2f}"
            return None, f"Need Value to compute: Ad Valorem rate ({ad_val}) × Value"

        # Codes 9, K, X, T → manual review
        return None, f"Rate type '{code}': {RATE_TYPE_DESCRIPTIONS.get(code, 'Unknown')} — manual review required"

    # ── Step 5: Additional duties (Phase 2 placeholder) ────────

    def check_additional_duties(self, hts_code: str, country: str) -> list[dict]:
        """
        Check for additional duties: Section 301, 232, AD/CVD.
        Phase 2: Will query a separate additional_duties table.
        For now, returns known broad categories.
        """
        additional = []
        clean_code = hts_code.replace(".", "")
        chapter = clean_code[:2] if len(clean_code) >= 2 else ""

        # Section 301 (China) — broad indicator
        if country.lower() == "china":
            additional.append({
                "type": "Section 301",
                "description": "China Section 301 tariffs may apply (7.5% - 100% depending on List and product)",
                "rate": None,  # Would need the Section 301 lists data
                "status": "check_required",
                "note": "Verify against USTR Section 301 exclusion lists for current rates",
            })

        # Section 232 (Steel & Aluminum) — based on chapter
        if chapter in ("72", "73"):  # Iron and steel
            additional.append({
                "type": "Section 232",
                "description": "Section 232 tariff on steel products: 25%",
                "rate": 0.25,
                "status": "likely_applicable",
                "note": "Exemptions may apply for FTA partners; check product-specific exclusions",
            })
        elif chapter == "76":  # Aluminum
            additional.append({
                "type": "Section 232",
                "description": "Section 232 tariff on aluminum products: 10%",
                "rate": 0.10,
                "status": "likely_applicable",
                "note": "Exemptions may apply for FTA partners; check product-specific exclusions",
            })

        # Antidumping / Countervailing — would need AD/CVD order data
        # Phase 2: Query against ITC AD/CVD order database

        return additional

    # ── Step 6: Full calculation pipeline ──────────────────────

    def calculate(
        self,
        hts_code: str,
        country: str,
        value: Optional[float] = None,
        quantity_1: Optional[float] = None,
        quantity_2: Optional[float] = None,
    ) -> DutyResult:
        """
        Full tariff calculation pipeline.

        Args:
            hts_code: 8-digit HTS code (with or without dots)
            country: Country of origin name (must match country_tariff_mapping.country_name)
            value: Customs value in USD (for ad valorem calculations)
            quantity_1: Primary quantity (for specific rate calculations)
            quantity_2: Secondary quantity (for compound rate calculations)

        Returns:
            DutyResult with all tariff details
        """
        result = DutyResult(hts_code=hts_code, country=country)

        # Step 1: Lookup HTS code
        hts_data = self.lookup_rates(hts_code)
        if not hts_data:
            result.notes.append(f"HTS code {hts_code} not found in tariff_rates")
            return result

        result.description = hts_data.get("brief_description")
        result.quantity_1_code = hts_data.get("quantity_1_code")
        result.quantity_2_code = hts_data.get("quantity_2_code")
        result.mfn_text_rate = hts_data.get("mfn_text_rate")
        result.col1_special_text = hts_data.get("col1_special_text")

        # Step 2: Determine country treatment
        country_treatment = self.get_country_treatment(country)
        if country_treatment.notes:
            result.notes.append(country_treatment.notes)

        # Step 3: Find applicable rate
        rate_info = self.determine_applicable_rate(hts_data, country_treatment)
        result.rate_info = rate_info
        result.treatment_applied = rate_info.treatment_applied

        # Step 4: Compute duty if possible
        computed, formula = self.compute_duty(rate_info, value, quantity_1, quantity_2)
        result.computed_duty = computed
        result.duty_formula = formula

        # Step 5: Check additional duties
        result.additional_duties = self.check_additional_duties(hts_code, country)

        # Total duty
        if computed is not None:
            additional_total = sum(
                (d.get("rate", 0) or 0) * (value or 0)
                for d in result.additional_duties
                if d.get("rate") is not None and d.get("status") == "likely_applicable"
            )
            result.total_duty = computed + additional_total

        return result

    def close(self):
        """Close the HTTP client."""
        self.client.close()


# ── CLI ────────────────────────────────────────────────────────

def main():
    import argparse

    parser = argparse.ArgumentParser(description="Calculate US import tariff duty")
    parser.add_argument("--hts", required=True, help="8-digit HTS code (e.g., 8471.30.01 or 84713001)")
    parser.add_argument("--country", required=True, help="Country of origin (e.g., 'South Korea', 'China')")
    parser.add_argument("--value", type=float, help="Customs value in USD")
    parser.add_argument("--qty1", type=float, help="Primary quantity")
    parser.add_argument("--qty2", type=float, help="Secondary quantity")
    args = parser.parse_args()

    calc = TariffCalculator()
    try:
        result = calc.calculate(
            hts_code=args.hts,
            country=args.country,
            value=args.value,
            quantity_1=args.qty1,
            quantity_2=args.qty2,
        )

        print("\n" + "=" * 60)
        print(f"  HTS Code:    {result.hts_code}")
        print(f"  Description: {result.description}")
        print(f"  Country:     {result.country}")
        print(f"  Treatment:   {result.treatment_applied}")
        print("=" * 60)

        if result.rate_info:
            ri = result.rate_info
            print(f"\n  Rate Type:      {ri.rate_type_code} — {ri.rate_type_description}")
            print(f"  Ad Valorem:     {ri.ad_val_rate}")
            print(f"  Specific Rate:  {ri.specific_rate}")
            print(f"  Other Rate:     {ri.other_rate}")
            if ri.text_rate:
                print(f"  Text Rate:      {ri.text_rate}")
            print(f"  Is Free:        {ri.is_free}")
            if ri.needs_manual_review:
                print(f"  ⚠ MANUAL REVIEW REQUIRED")

        if result.mfn_text_rate:
            print(f"\n  MFN Text Rate:  {result.mfn_text_rate}")
        if result.col1_special_text:
            print(f"  Special Progs:  {result.col1_special_text}")
        if result.quantity_1_code:
            print(f"  Qty1 Code:      {result.quantity_1_code}")
        if result.quantity_2_code:
            print(f"  Qty2 Code:      {result.quantity_2_code}")

        if result.duty_formula:
            print(f"\n  Duty Formula:   {result.duty_formula}")
        if result.computed_duty is not None:
            print(f"  Computed Duty:  ${result.computed_duty:.2f}")

        if result.additional_duties:
            print(f"\n  Additional Duties:")
            for ad in result.additional_duties:
                print(f"    - {ad['type']}: {ad['description']}")

        if result.total_duty is not None:
            print(f"\n  TOTAL DUTY:     ${result.total_duty:.2f}")

        if result.notes:
            print(f"\n  Notes:")
            for n in result.notes:
                print(f"    - {n}")

        print()

        # Also output JSON for programmatic use
        print("--- JSON Output ---")
        print(json.dumps(result.to_dict(), indent=2, default=str))

    finally:
        calc.close()


if __name__ == "__main__":
    main()
