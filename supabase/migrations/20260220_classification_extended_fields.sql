-- Migration: Add extended classification fields to user_product_classification_results
-- These fields store the full classification data returned by the API so it can be
-- displayed later in the ExceptionReview and ProductProfile screens.

-- Add new columns to user_product_classification_results
ALTER TABLE user_product_classification_results
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS reasoning TEXT,
  ADD COLUMN IF NOT EXISTS chapter_code TEXT,
  ADD COLUMN IF NOT EXISTS chapter_title TEXT,
  ADD COLUMN IF NOT EXISTS section_code TEXT,
  ADD COLUMN IF NOT EXISTS section_title TEXT,
  ADD COLUMN IF NOT EXISTS cbp_rulings JSONB,
  ADD COLUMN IF NOT EXISTS rule_verification JSONB,
  ADD COLUMN IF NOT EXISTS rule_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS similarity_score NUMERIC,
  ADD COLUMN IF NOT EXISTS classification_trace TEXT,
  ADD COLUMN IF NOT EXISTS alternate_classifications JSONB;
