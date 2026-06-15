-- schema_isnad_tables.sql
-- Isnad (chain of narration) supplementary tables

-- Reference table: relation type labels
CREATE TABLE IF NOT EXISTS isnad_relation_types (
    id          INTEGER PRIMARY KEY,
    text        TEXT
);

-- Isnad tree: hierarchical narrator/chain structure
CREATE TABLE IF NOT EXISTS isnad_tree (
    id              INTEGER PRIMARY KEY,
    name            TEXT,
    parent_id       INTEGER,
    is_leaf         BOOLEAN,
    left_value      INTEGER,
    right_value     INTEGER,
    rawy_id         INTEGER,
    is_marfoa       BOOLEAN,
    is_mawkof       BOOLEAN,
    is_maktoa       BOOLEAN,
    is_marfoa_hokm  BOOLEAN
);

CREATE INDEX IF NOT EXISTS idx_isnad_tree_rawy_id   ON isnad_tree (rawy_id);
CREATE INDEX IF NOT EXISTS idx_isnad_tree_parent_id ON isnad_tree (parent_id);

-- Isnad relations: links between hadiths and chains with relation type
CREATE TABLE IF NOT EXISTS isnad_relations (
    id              INTEGER PRIMARY KEY,
    hadith_main_id  INTEGER,
    sand_id         INTEGER,
    relation_id     INTEGER,
    rwah            TEXT
);

CREATE INDEX IF NOT EXISTS idx_isnad_relations_hadith  ON isnad_relations (hadith_main_id);
CREATE INDEX IF NOT EXISTS idx_isnad_relations_sand    ON isnad_relations (sand_id);
CREATE INDEX IF NOT EXISTS idx_isnad_relations_relid   ON isnad_relations (relation_id);

-- Isnad tahdeth: narration text/chain encodings per entry
CREATE TABLE IF NOT EXISTS isnad_tahdeth (
    id              INTEGER PRIMARY KEY,
    sand_tahdeth    TEXT
);
