CREATE TABLE IF NOT EXISTS takhrij (
    hadith_id         INTEGER PRIMARY KEY,
    group_id          INTEGER NOT NULL,
    compound_matn_id  INTEGER,
    book_id           INTEGER
);
CREATE INDEX IF NOT EXISTS idx_takhrij_group ON takhrij(group_id);
