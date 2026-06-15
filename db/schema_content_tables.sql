-- Content feature tables: amthal, gwamh, gwamh_items, matn_dates
-- All tables use IF NOT EXISTS to be idempotent

-- Prophetic proverbs / analogies (Amthal.json)
CREATE TABLE IF NOT EXISTS amthal (
    id          INTEGER PRIMARY KEY,
    text        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_amthal_id ON amthal (id);

-- Comprehensive hadiths collection headers (Gwamh.json)
CREATE TABLE IF NOT EXISTS gwamh (
    id          INTEGER PRIMARY KEY,
    name        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gwamh_id ON gwamh (id);

-- Items linking hadiths to gwamh entries (GwamhItems.json)
CREATE TABLE IF NOT EXISTS gwamh_items (
    gamh_id     INTEGER NOT NULL,
    id          INTEGER NOT NULL,
    text        TEXT,
    PRIMARY KEY (gamh_id, id)
);

CREATE INDEX IF NOT EXISTS idx_gwamh_items_gamh_id ON gwamh_items (gamh_id);
CREATE INDEX IF NOT EXISTS idx_gwamh_items_id      ON gwamh_items (id);

-- Matn text dating information (MatnDates.json)
CREATE TABLE IF NOT EXISTS matn_dates (
    id          INTEGER PRIMARY KEY,
    text        TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_matn_dates_id ON matn_dates (id);
