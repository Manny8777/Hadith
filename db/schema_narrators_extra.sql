CREATE TABLE IF NOT EXISTS narrator_grading (
    id INTEGER PRIMARY KEY,
    text TEXT,
    sort INTEGER,
    is_taqreeb BOOLEAN DEFAULT FALSE
);
CREATE TABLE IF NOT EXISTS narrator_books (
    narrator_id INTEGER NOT NULL,
    book_id INTEGER NOT NULL,
    PRIMARY KEY (narrator_id, book_id)
);
CREATE TABLE IF NOT EXISTS narrator_relations (
    first_id INTEGER NOT NULL,
    second_id INTEGER NOT NULL,
    relation_type INTEGER,
    is_sheikh BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (first_id, second_id, relation_type)
);
CREATE TABLE IF NOT EXISTS narrator_relation_types (
    id INTEGER PRIMARY KEY,
    text TEXT
);
CREATE INDEX IF NOT EXISTS idx_narrator_books_narrator ON narrator_books(narrator_id);
CREATE INDEX IF NOT EXISTS idx_narrator_relations_first ON narrator_relations(first_id);
CREATE INDEX IF NOT EXISTS idx_narrator_relations_second ON narrator_relations(second_id);
