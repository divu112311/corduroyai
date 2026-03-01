-- Migration: Audit Trail Protection
-- Created: 2026-03-01
-- Purpose: Prevent deletion of classification runs, products, and results
-- These records form an audit trail and must never be deleted.

-- Prevent deletion of classification runs
CREATE POLICY "no_delete_classification_runs" ON public.classification_runs
  FOR DELETE USING (false);

-- Prevent deletion of user products
CREATE POLICY "no_delete_user_products" ON public.user_products
  FOR DELETE USING (false);

-- Prevent deletion of classification results
CREATE POLICY "no_delete_classification_results" ON public.user_product_classification_results
  FOR DELETE USING (false);
