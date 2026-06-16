-- schema_missing_tables.sql
-- All tables not yet present in Railway PostgreSQL

-- ── Isnad lookup tables ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS isnad_tahdeth_types (
    id      INTEGER PRIMARY KEY,
    text    TEXT
);

CREATE TABLE IF NOT EXISTS isnad_types (
    id      INTEGER PRIMARY KEY,
    text    TEXT
);

-- ── Narrator enrichment ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS narrator_grading_links (
    rawy_id     INTEGER,
    garh_id     INTEGER,
    say_id      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_ngl_rawy ON narrator_grading_links (rawy_id);

CREATE TABLE IF NOT EXISTS narrator_translation (
    noun_id         INTEGER,
    service_main_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nt_noun ON narrator_translation (noun_id);

CREATE TABLE IF NOT EXISTS narrator_name_forms (
    id              INTEGER PRIMARY KEY,
    rawy_id         INTEGER,
    rawy_text       TEXT,
    rawy_text_shape TEXT,
    frequency       INTEGER,
    rawy_text_id    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nnf_rawy ON narrator_name_forms (rawy_id);

CREATE TABLE IF NOT EXISTS narrator_teachers (
    rawy_id     INTEGER,
    shyoukh_id  INTEGER,
    hadiths_count INTEGER
);
CREATE INDEX IF NOT EXISTS idx_nteach_rawy    ON narrator_teachers (rawy_id);
CREATE INDEX IF NOT EXISTS idx_nteach_shyoukh ON narrator_teachers (shyoukh_id);

CREATE TABLE IF NOT EXISTS narrator_criticism_links (
    say_id              INTEGER,
    service_main_id     INTEGER,
    link_id             INTEGER,
    is_book_toc_hadith  BOOLEAN
);
CREATE INDEX IF NOT EXISTS idx_ncl_say ON narrator_criticism_links (say_id);

-- ── Quran system ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS quran_suras (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    has_tafsser BOOLEAN,
    has_qera    BOOLEAN
);

CREATE TABLE IF NOT EXISTS quran_ayat (
    id          INTEGER PRIMARY KEY,
    sora_id     INTEGER,
    aya_num     INTEGER,
    text        TEXT,
    has_tafsser BOOLEAN,
    has_qera    BOOLEAN,
    kerat_text  TEXT
);
CREATE INDEX IF NOT EXISTS idx_qa_sora ON quran_ayat (sora_id);

CREATE TABLE IF NOT EXISTS quran_ayat_services (
    id              INTEGER PRIMARY KEY,
    service_main_id INTEGER,
    sura            INTEGER,
    aya             INTEGER
);
CREATE INDEX IF NOT EXISTS idx_qas_sura_aya ON quran_ayat_services (sura, aya);

CREATE TABLE IF NOT EXISTS quran_ayat_qiraat (
    aya_id          INTEGER,
    service_main_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_qaq_aya ON quran_ayat_qiraat (aya_id);

CREATE TABLE IF NOT EXISTS quran_readers (
    id          INTEGER PRIMARY KEY,
    reader_name TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN,
    left_value  INTEGER,
    right_value INTEGER,
    node_id     INTEGER,
    is_colored  BOOLEAN
);

CREATE TABLE IF NOT EXISTS quran_readers_ayat (
    reader_id   INTEGER,
    aya_id      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_qra_reader ON quran_readers_ayat (reader_id);
CREATE INDEX IF NOT EXISTS idx_qra_aya    ON quran_readers_ayat (aya_id);

-- ── Book structure ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sections (
    id          INTEGER PRIMARY KEY,
    name        TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN,
    left_value  INTEGER,
    right_value INTEGER
);

CREATE TABLE IF NOT EXISTS section_books (
    id          INTEGER PRIMARY KEY,
    book_id     INTEGER,
    section_id  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sb_book    ON section_books (book_id);
CREATE INDEX IF NOT EXISTS idx_sb_section ON section_books (section_id);

CREATE TABLE IF NOT EXISTS book_extra (
    book_id     INTEGER,
    rawy_id     INTEGER,
    rawy_name   TEXT,
    count       INTEGER
);
CREATE INDEX IF NOT EXISTS idx_be_book ON book_extra (book_id);

-- ── Hadith expressions/search tree ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hadith_expressions_tree (
    id          INTEGER PRIMARY KEY,
    text        TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN,
    left_value  INTEGER,
    right_value INTEGER,
    node_id     INTEGER,
    is_matn     BOOLEAN,
    is_sand     BOOLEAN,
    is_rawy     BOOLEAN,
    is_colored  BOOLEAN
);

CREATE TABLE IF NOT EXISTS hadith_expressions_hits (
    node_id     INTEGER,
    hit_id      INTEGER
);
CREATE INDEX IF NOT EXISTS idx_heh_node ON hadith_expressions_hits (node_id);

CREATE TABLE IF NOT EXISTS hadith_expressions_says (
    node_id         INTEGER,
    scientist_id    INTEGER,
    say             TEXT,
    service_main_id INTEGER,
    link_id         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hes_node ON hadith_expressions_says (node_id);

-- ── Hadith controversial tree ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hadith_controversial_tree (
    id          INTEGER PRIMARY KEY,
    text        TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN,
    left_value  INTEGER,
    right_value INTEGER,
    node_id     INTEGER,
    is_colored  BOOLEAN
);

CREATE TABLE IF NOT EXISTS hadith_controversial_descriptions (
    node_id         INTEGER,
    service_main_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hcd_node ON hadith_controversial_descriptions (node_id);

-- ── Hadith matn groupings ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hadith_compound_matn (
    id              INTEGER PRIMARY KEY,
    matn            TEXT,
    hadith_main_id  INTEGER,
    asaned_comp     TEXT
);
CREATE INDEX IF NOT EXISTS idx_hcm_hadith ON hadith_compound_matn (hadith_main_id);

CREATE TABLE IF NOT EXISTS hadith_group_matn (
    hadith_main_id  INTEGER,
    group_id        INTEGER,
    book_id         INTEGER
);
CREATE INDEX IF NOT EXISTS idx_hgm_hadith ON hadith_group_matn (hadith_main_id);
CREATE INDEX IF NOT EXISTS idx_hgm_group  ON hadith_group_matn (group_id);

-- ── Hadith metadata flags ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hadith_ghareeb (
    hadith_main_id  INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS hadith_modrag (
    hadith_main_id  INTEGER PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS hadith_shawahed (
    hadith_main_id  INTEGER PRIMARY KEY
);

-- ── Judgment scientist reference ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hadith_judgment_scientists (
    id      INTEGER PRIMARY KEY,
    name    TEXT
);

-- ── Narrator mutual narration ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS narrator_mutual_narrators (
    pr_id       INTEGER,
    shyoukh_id  INTEGER,
    sh_name     TEXT,
    rawy_id     INTEGER,
    r_name      TEXT
);
CREATE INDEX IF NOT EXISTS idx_nmn_pr    ON narrator_mutual_narrators (pr_id);
CREATE INDEX IF NOT EXISTS idx_nmn_rawy  ON narrator_mutual_narrators (rawy_id);

-- ── Pages (large — book pagination) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pages (
    main_id         INTEGER,
    part_num        INTEGER,
    page_num        INTEGER,
    page_id         INTEGER,
    next_page_id    INTEGER,
    prev_page_id    INTEGER
);
CREATE INDEX IF NOT EXISTS idx_pages_main ON pages (main_id);

-- ── Alter existing tables ──────────────────────────────────────────────────────

-- Add SanadTahdethID to isnad_hadiths (was missing from original seed)
ALTER TABLE isnad_hadiths ADD COLUMN IF NOT EXISTS sanad_tahdeth_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_ih_tahdeth ON isnad_hadiths (sanad_tahdeth_id);

-- Add missing flags to hadith_services from HadithServicesState
ALTER TABLE hadith_services ADD COLUMN IF NOT EXISTS countries      BOOLEAN DEFAULT false;
ALTER TABLE hadith_services ADD COLUMN IF NOT EXISTS modrag         BOOLEAN DEFAULT false;
ALTER TABLE hadith_services ADD COLUMN IF NOT EXISTS kerat          BOOLEAN DEFAULT false;
ALTER TABLE hadith_services ADD COLUMN IF NOT EXISTS proper_name    BOOLEAN DEFAULT false;
ALTER TABLE hadith_services ADD COLUMN IF NOT EXISTS matn_comparison BOOLEAN DEFAULT false;
