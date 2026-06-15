CREATE TABLE IF NOT EXISTS narrator_grading_terms (
    id INTEGER PRIMARY KEY,
    term_text TEXT NOT NULL,
    sort_order INTEGER,
    is_taqreeb BOOLEAN DEFAULT false
);

-- NounsScientists fields: ID, ScientistID, RelaterID, ScientistName, RelaterName
-- Represents scholar-narrator evaluation links (muhadditheen grading chains)
CREATE TABLE IF NOT EXISTS narrator_scientists (
    id INTEGER PRIMARY KEY,
    scientist_id INTEGER,
    relater_id INTEGER,
    scientist_name TEXT,
    relater_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_narrator_scientists_scientist ON narrator_scientists(scientist_id);
CREATE INDEX IF NOT EXISTS idx_narrator_scientists_relater ON narrator_scientists(relater_id);
