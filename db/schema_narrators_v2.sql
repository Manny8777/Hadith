-- Add missing narrator fields that exist in Nouns.json but were never mapped
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS laqab TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS nasab TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS living_city TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS selat_karaba TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS journey_city TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS mazhb TEXT DEFAULT '';
ALTER TABLE narrators ADD COLUMN IF NOT EXISTS esm_shuhra TEXT DEFAULT '';
