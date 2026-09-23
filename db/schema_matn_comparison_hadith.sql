-- matn comparisons as the original actually keys them, which is NOT how the old extract keyed them.
--
-- Legacy `HMatnComparison1..33` is anchored on a HADITH (`MasterMatnID` is a hadith main id — 100 % of
-- shards 3–33 resolve in hadith_toc.main_id, and shard 1's master 5 lists hadiths about النية, matching
-- hadith 5 "إنما الأعمال بالنيات"), while `matn_comparison.master_compound_id` is anchored on a compound
-- matn. Putting the shards' rows in that column would attach them to unrelated hadiths, so they live in
-- their own table here and `matn_comparison` stays what the app's own extract made it.
--
-- The 49 distinct Comment phrases are stored once as an enum: the text is ~33 MB across 8 M rows, the
-- ids are 16 MB.

CREATE TABLE IF NOT EXISTS matn_comparison_labels (
  id     smallint PRIMARY KEY,
  phrase text NOT NULL
);

CREATE TABLE IF NOT EXISTS matn_comparison_hadith (
  master_hadith_id integer  NOT NULL,   -- the hadith whose matn the comparison is anchored on
  slave_hadith_id  integer  NOT NULL,   -- the hadith it was compared against
  match_sort       smallint NOT NULL DEFAULT 0,
  label_id         smallint REFERENCES matn_comparison_labels(id),
  PRIMARY KEY (master_hadith_id, slave_hadith_id)
);

CREATE INDEX IF NOT EXISTS idx_matn_cmp_hadith_slave ON matn_comparison_hadith (slave_hadith_id);
CREATE INDEX IF NOT EXISTS idx_matn_cmp_hadith_label ON matn_comparison_hadith (label_id);

-- What the app queries: the original's own comparison pairs for a hadith, with their wording.
CREATE OR REPLACE VIEW matn_comparison_hadith_v AS
SELECT m.master_hadith_id,
       m.slave_hadith_id,
       m.match_sort,
       l.phrase AS description
  FROM matn_comparison_hadith m
  LEFT JOIN matn_comparison_labels l ON l.id = m.label_id;
