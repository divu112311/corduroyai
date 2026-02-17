-- Migration: Add Bulk SKU Classification Support
-- Created: 2025-02-17
-- Purpose: Add tables and schema updates for bulk file upload and classification

-- ============================================================================
-- 1. Update user_product_classification_results table
-- ============================================================================
-- Fix the alternate_classifications field (currently stores only single varchar)
-- Add missing fields for reasoning, CBP rulings, and HTS descriptions

ALTER TABLE public.user_product_classification_results
ADD COLUMN IF NOT EXISTS alternate_classifications jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS reasoning text,
ADD COLUMN IF NOT EXISTS cbp_rulings jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS hts_description text,
ADD COLUMN IF NOT EXISTS bulk_item_id uuid;

-- ============================================================================
-- 2. Create bulk_classification_runs table
-- ============================================================================
-- Tracks each bulk upload/classification session
CREATE TABLE IF NOT EXISTS public.bulk_classification_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_type text NOT NULL CHECK (file_type IN ('csv', 'xlsx', 'pdf')),
  file_url text,
  total_items integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  progress_current integer NOT NULL DEFAULT 0,
  progress_total integer NOT NULL,
  error_message text,
  results_summary jsonb DEFAULT '{"completed": 0, "exceptions": 0, "errors": 0}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_bulk_runs_user_id ON public.bulk_classification_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_bulk_runs_status ON public.bulk_classification_runs(status);
CREATE INDEX IF NOT EXISTS idx_bulk_runs_created_at ON public.bulk_classification_runs(created_at DESC);

-- ============================================================================
-- 3. Create bulk_classification_items table
-- ============================================================================
-- Tracks individual products within a bulk classification run
CREATE TABLE IF NOT EXISTS public.bulk_classification_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.bulk_classification_runs(id) ON DELETE CASCADE,
  row_number integer NOT NULL,
  extracted_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'exception', 'error')),
  classification_result_id uuid REFERENCES public.user_product_classification_results(id) ON DELETE SET NULL,
  error text,
  clarification_questions jsonb,
  clarification_answers jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Composite unique constraint: one row per run
  CONSTRAINT unique_run_row UNIQUE(run_id, row_number)
);

-- Indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_bulk_items_run_id ON public.bulk_classification_items(run_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_status ON public.bulk_classification_items(status);
CREATE INDEX IF NOT EXISTS idx_bulk_items_result_id ON public.bulk_classification_items(classification_result_id);
CREATE INDEX IF NOT EXISTS idx_bulk_items_created_at ON public.bulk_classification_items(created_at DESC);

-- ============================================================================
-- 4. Add foreign key constraint to link classifications back to bulk items
-- ============================================================================
ALTER TABLE public.user_product_classification_results
ADD CONSTRAINT fk_bulk_item_id
FOREIGN KEY (bulk_item_id) REFERENCES public.bulk_classification_items(id) ON DELETE SET NULL;

-- ============================================================================
-- 5. Create triggers to auto-update timestamps
-- ============================================================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for bulk_classification_runs
CREATE TRIGGER update_bulk_runs_updated_at
BEFORE UPDATE ON public.bulk_classification_runs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Trigger for bulk_classification_items
CREATE TRIGGER update_bulk_items_updated_at
BEFORE UPDATE ON public.bulk_classification_items
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. Grant permissions (if using RLS)
-- ============================================================================
ALTER TABLE public.bulk_classification_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bulk_classification_items ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view their own bulk runs
CREATE POLICY "Users can view own bulk runs"
  ON public.bulk_classification_runs
  FOR SELECT
  USING (user_id = auth.uid());

-- Policy: Users can insert their own bulk runs
CREATE POLICY "Users can insert bulk runs"
  ON public.bulk_classification_runs
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can update their own bulk runs
CREATE POLICY "Users can update own bulk runs"
  ON public.bulk_classification_runs
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Policy: Users can view items from their bulk runs
CREATE POLICY "Users can view bulk items"
  ON public.bulk_classification_items
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.bulk_classification_runs
    WHERE id = run_id AND user_id = auth.uid()
  ));

-- Policy: Users can insert bulk items (admin or through app)
CREATE POLICY "Users can insert bulk items"
  ON public.bulk_classification_items
  FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bulk_classification_runs
    WHERE id = run_id AND user_id = auth.uid()
  ));

-- Policy: Users can update their bulk items
CREATE POLICY "Users can update bulk items"
  ON public.bulk_classification_items
  FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.bulk_classification_runs
    WHERE id = run_id AND user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.bulk_classification_runs
    WHERE id = run_id AND user_id = auth.uid()
  ));
