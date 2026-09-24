CREATE TABLE IF NOT EXISTS takhrij (
    hadith_id         INTEGER NOT NULL,
    group_id          INTEGER NOT NULL,
    compound_matn_id  INTEGER,
    book_id           INTEGER
);
-- One row per (hadith, group, matn) membership. A primary key on hadith_id alone lets a hadith
-- hold only one of its groups: the original's HTakhreeg has 281,541 rows / 280,259 distinct
-- memberships, and keying on hadith_id silently kept 273,698 of them.
CREATE UNIQUE INDEX IF NOT EXISTS takhrij_membership_key
    ON takhrij(hadith_id, group_id, compound_matn_id);
CREATE INDEX IF NOT EXISTS idx_takhrij_group ON takhrij(group_id);
CREATE INDEX IF NOT EXISTS idx_takhrij_hadith ON takhrij(hadith_id);
