CREATE TABLE IF NOT EXISTS lexicon_categories (
    id   INTEGER PRIMARY KEY,
    name TEXT
);

CREATE TABLE IF NOT EXISTS lexicon_items (
    id            INTEGER PRIMARY KEY,
    lexicon_id    INTEGER REFERENCES lexicon_categories(id),
    text          TEXT,
    parent_id     INTEGER,
    left_value    INTEGER,
    right_value   INTEGER,
    is_leaf       BOOLEAN DEFAULT FALSE,
    results_count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS lexicon_hadith (
    lexicon_item_id INTEGER NOT NULL REFERENCES lexicon_items(id),
    hadith_id       INTEGER NOT NULL,
    PRIMARY KEY (lexicon_item_id, hadith_id)
);

CREATE INDEX IF NOT EXISTS idx_lexicon_items_text ON lexicon_items USING gin(to_tsvector('simple', coalesce(text,'')));
CREATE INDEX IF NOT EXISTS idx_lexicon_items_parent ON lexicon_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_lexicon_hadith_item ON lexicon_hadith(lexicon_item_id);
CREATE INDEX IF NOT EXISTS idx_lexicon_hadith_hadith ON lexicon_hadith(hadith_id);
