-- Subject index schema (الفهارس الموضوعية)
-- Subject categories (hierarchical tree using nested set model)
CREATE TABLE IF NOT EXISTS subject_categories (
    id          INTEGER PRIMARY KEY,
    title       TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN DEFAULT FALSE,
    left_value  INTEGER,
    right_value INTEGER,
    node_id     INTEGER,
    is_colored  BOOLEAN DEFAULT FALSE
);

-- Individual subject/topic entries under each category
CREATE TABLE IF NOT EXISTS subject_items (
    id          INTEGER PRIMARY KEY,
    title       TEXT,
    parent_id   INTEGER,
    is_leaf     BOOLEAN DEFAULT FALSE,
    left_value  INTEGER,
    right_value INTEGER,
    node_id     INTEGER,
    is_colored  BOOLEAN DEFAULT FALSE
);

-- Links between hadiths and subjects
-- paragraph_main_id is the ParagraphMainID from SubjectHit (links to hadith_toc.main_id where is_paragraph=true)
CREATE TABLE IF NOT EXISTS hadith_subjects (
    id                  INTEGER PRIMARY KEY,
    subject_id          INTEGER NOT NULL REFERENCES subject_items(id),
    paragraph_main_id   INTEGER NOT NULL,
    node_id             INTEGER
);

CREATE INDEX IF NOT EXISTS idx_subject_categories_parent ON subject_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_subject_categories_left   ON subject_categories(left_value);
CREATE INDEX IF NOT EXISTS idx_subject_items_parent      ON subject_items(parent_id);
CREATE INDEX IF NOT EXISTS idx_subject_items_left        ON subject_items(left_value);
CREATE INDEX IF NOT EXISTS idx_subject_items_title       ON subject_items USING gin(to_tsvector('simple', coalesce(title,'')));
CREATE INDEX IF NOT EXISTS idx_hadith_subjects_subject   ON hadith_subjects(subject_id);
CREATE INDEX IF NOT EXISTS idx_hadith_subjects_hadith    ON hadith_subjects(paragraph_main_id);
