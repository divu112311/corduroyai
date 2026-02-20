-- Add auto-approve toggle columns to user_metadata
ALTER TABLE user_metadata
  ADD COLUMN IF NOT EXISTS auto_approve_single BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_approve_bulk BOOLEAN NOT NULL DEFAULT false;

-- Add approval_reason column to classification history
ALTER TABLE user_product_classification_history
  ADD COLUMN IF NOT EXISTS approval_reason TEXT;
