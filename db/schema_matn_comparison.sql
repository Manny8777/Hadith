DROP TABLE IF EXISTS matn_comparison;
CREATE TABLE matn_comparison (
    master_compound_id  INTEGER NOT NULL,
    slave_hadith_id     INTEGER NOT NULL,
    description         TEXT,
    match_sort          SMALLINT,
    PRIMARY KEY (master_compound_id, slave_hadith_id)
);
CREATE INDEX IF NOT EXISTS idx_mc_master ON matn_comparison(master_compound_id);
