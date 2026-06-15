-- ALTER TABLE statements to add missing columns to takhrij table
ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS pivot_rawy TEXT;
ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS pivot_id INTEGER;
ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS sand_rawy TEXT;
ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS matn_length INTEGER;
ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS is_story BOOLEAN;
