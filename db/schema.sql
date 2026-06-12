-- schema.sql — Hadith Encyclopedia PostgreSQL schema
-- Run: psql $DATABASE_URL -f db/schema.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- ─── Books ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS books (
    id               INTEGER PRIMARY KEY,
    title            TEXT NOT NULL,
    summary          TEXT,
    author_id        INTEGER,
    strong           INTEGER DEFAULT 0,
    fame             INTEGER DEFAULT 0,
    tarteeb          INTEGER DEFAULT 0,
    takhrij_author   TEXT,
    takhrij_death    INTEGER,
    card_info        TEXT,
    print1_edition   TEXT
);

-- ─── Authors ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS authors (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    short_name  TEXT,
    death_date  INTEGER,
    info        TEXT
);

-- ─── Narrators ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS narrators (
    id              INTEGER PRIMARY KEY,
    name            TEXT,
    abb_name        TEXT,
    kunia           TEXT,
    death_year      TEXT,
    death_year_num  INTEGER DEFAULT 0,
    birth_year      TEXT,
    death_city      TEXT,
    birth_city      TEXT,
    tabaqa          TEXT,
    tabaqa_num      INTEGER DEFAULT 0,
    hadiths_count   INTEGER DEFAULT 0,
    martaba_ibn_hajar TEXT,
    martaba_zahabi   TEXT,
    is_companion    BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_narrators_name ON narrators USING gin(name gin_trgm_ops);

-- ─── Isnad chains ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS isnad_chains (
    id              INTEGER PRIMARY KEY,
    narrator_ids    TEXT,   -- space-separated Nouns IDs
    types           TEXT,
    hadiths_count   INTEGER DEFAULT 0
);

-- ─── Hadith → Isnad link ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS isnad_hadiths (
    hadith_id   INTEGER NOT NULL,
    book_id     INTEGER,
    isnad_id    INTEGER NOT NULL REFERENCES isnad_chains(id),
    isnad_type  INTEGER DEFAULT 1,
    PRIMARY KEY (hadith_id, isnad_id)
);

CREATE INDEX IF NOT EXISTS idx_isnad_hadiths_hadith ON isnad_hadiths(hadith_id);

-- ─── Hadith TOC (main content) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS hadith_toc (
    main_id             INTEGER PRIMARY KEY,
    book_id             INTEGER NOT NULL REFERENCES books(id),
    book_name           TEXT,
    id                  INTEGER,
    content             TEXT,
    parent_id           INTEGER,
    is_leaf             BOOLEAN DEFAULT FALSE,
    is_paragraph        BOOLEAN DEFAULT FALSE,
    paragraph_id        INTEGER,
    next_paragraph_id   INTEGER,
    prev_paragraph_id   INTEGER,
    left_value          INTEGER,
    right_value         INTEGER,
    section_text        TEXT,
    chapter_text        TEXT,
    part_num            INTEGER DEFAULT 0,
    page_num            INTEGER DEFAULT 0,
    tarf                TEXT,
    tarqeem_harf        TEXT,
    tarqeem_matboa1     TEXT,
    mosanef_id          INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hadith_toc_book_id   ON hadith_toc(book_id);
CREATE INDEX IF NOT EXISTS idx_hadith_toc_parent_id ON hadith_toc(parent_id);
CREATE INDEX IF NOT EXISTS idx_hadith_toc_is_leaf    ON hadith_toc(is_leaf) WHERE is_leaf = TRUE;
CREATE INDEX IF NOT EXISTS idx_hadith_toc_tarf       ON hadith_toc USING gin(to_tsvector('simple', coalesce(tarf,'')));
CREATE INDEX IF NOT EXISTS idx_hadith_toc_content    ON hadith_toc USING gin(to_tsvector('simple', coalesce(content,'')));

-- ─── Hadith Judgments ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hadith_judgments (
    id          SERIAL PRIMARY KEY,
    hadith_id   INTEGER NOT NULL,
    scientist_id INTEGER,
    say_text    TEXT
);

CREATE INDEX IF NOT EXISTS idx_judgments_hadith_id ON hadith_judgments(hadith_id);
