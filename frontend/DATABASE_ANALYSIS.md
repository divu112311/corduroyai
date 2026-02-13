# Database Tables Analysis for ExceptionReview Component

## ✅ Existing Tables

### 1. `user_products`
- ✅ `id`, `user_id`, `classification_run_id`
- ✅ `product_name`, `product_description`
- ✅ `country_of_origin`, `materials` (jsonb)
- ✅ `unit_cost`, `vendor`
- ✅ `created_at`, `updated_at`

### 2. `user_product_classification_results`
- ✅ `id`, `product_id`, `classification_run_id`
- ✅ `hts_classification` (primary HTS code)
- ⚠️ `alternate_classification` (single varchar - only stores ONE alternate)
- ✅ `tariff_rate`, `confidence`
- ✅ `unit_cost`, `tariff_amount`, `total_cost`
- ✅ `classified_at`
- ❌ **MISSING**: `alternate_classifications` (jsonb array with multiple alternates)
- ❌ **MISSING**: `reasoning` (text field for classification reasoning)
- ❌ **MISSING**: `cbp_rulings` (jsonb array for CBP rulings)
- ❌ **MISSING**: `hts_description` (description of the HTS code)

### 3. `user_product_documents`
- ✅ `id`, `user_id`, `product_id`, `classification_run_id`
- ✅ `document_type`, `file_name`, `file_type`, `file_url`
- ✅ `uploaded_at`

### 4. `user_product_classification_history`
- ✅ `id`, `product_id`, `classification_result_id`
- ✅ `approved`, `approved_at`

## ❌ Missing Tables/Fields

### Missing Fields in `user_product_classification_results`:

1. **`alternate_classifications` (jsonb)**
   - Should store array of: `{hts, description, confidence, cbp_rulings[]}`
   - Currently only `alternate_classification` (single varchar) exists

2. **`reasoning` (text)**
   - Classification reasoning/explanation
   - Currently not stored

3. **`cbp_rulings` (jsonb)**
   - Array of CBP rulings for primary HTS: `[{ruling_number, ruling_date, subject, url, hs_codes[]}]`
   - Currently not stored

4. **`hts_description` (text)**
   - Description of the HTS code
   - Currently not stored

5. **`rationale` (text)**
   - AI rationale for the classification
   - Currently not stored

### Missing Tables:

1. **`hts_code_lookup`** (optional but recommended)
   - `hts_code` (varchar, primary key)
   - `description` (text)
   - `chapter` (varchar)
   - `heading` (text)
   - `subheading` (text)
   - `tariff_rate` (numeric)
   - For storing HTS code hierarchy and descriptions

2. **`classification_issues`** (optional)
   - `id` (bigserial)
   - `classification_result_id` (references classification_results)
   - `issue_type` (varchar) - e.g., 'unclear_function', 'missing_materials', etc.
   - `issue_description` (text)
   - `impact` (varchar) - 'high', 'medium', 'low'
   - `resolved` (boolean)
   - For storing dynamic confidence analysis issues

## 📋 Required Schema Changes

### ALTER TABLE `user_product_classification_results`:

```sql
-- Add alternate_classifications (jsonb array)
ALTER TABLE public.user_product_classification_results
ADD COLUMN alternate_classifications jsonb DEFAULT '[]'::jsonb;

-- Add reasoning
ALTER TABLE public.user_product_classification_results
ADD COLUMN reasoning text;

-- Add cbp_rulings for primary HTS
ALTER TABLE public.user_product_classification_results
ADD COLUMN cbp_rulings jsonb DEFAULT '[]'::jsonb;

-- Add HTS description
ALTER TABLE public.user_product_classification_results
ADD COLUMN hts_description text;

-- Add rationale
ALTER TABLE public.user_product_classification_results
ADD COLUMN rationale text;
```

### Optional: Create HTS Lookup Table

```sql
CREATE TABLE public.hts_code_lookup (
  hts_code varchar(50) PRIMARY KEY,
  description text NOT NULL,
  chapter varchar(10),
  heading text,
  subheading text,
  tariff_rate numeric(6,4),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_hts_code_lookup_code ON public.hts_code_lookup(hts_code);
```

## 🔄 Data Flow Issues

### Current Flow:
1. ✅ Classification results saved to `user_product_classification_results`
2. ❌ **Alternate classifications** - Only first alternate saved (single varchar)
3. ❌ **CBP rulings** - Not saved at all
4. ❌ **Reasoning** - Not saved at all
5. ❌ **HTS descriptions** - Not saved

### What ExceptionReview Needs:
1. ✅ Product info from `user_products`
2. ❌ Multiple alternate classifications with confidence, descriptions, rulings
3. ❌ Classification reasoning
4. ❌ CBP rulings for primary and alternate HTS codes
5. ❌ HTS code hierarchy (chapter/heading/subheading)
6. ✅ Documents from `user_product_documents`

## 🎯 Summary

**Tables Exist:** ✅
- `user_products` ✅
- `user_product_classification_results` ⚠️ (missing fields)
- `user_product_documents` ✅
- `user_product_classification_history` ✅

**Missing Fields:** ❌
- `alternate_classifications` (jsonb) - Multiple alternates with full data
- `reasoning` (text) - Classification reasoning
- `cbp_rulings` (jsonb) - CBP rulings array
- `hts_description` (text) - HTS code description
- `rationale` (text) - AI rationale

**Optional Tables:** 
- `hts_code_lookup` - For HTS hierarchy/descriptions
- `classification_issues` - For dynamic confidence analysis

