CREATE TABLE IF NOT EXISTS narrator_biography (
  id          SERIAL PRIMARY KEY,
  narrator_id INTEGER NOT NULL,
  main_id     INTEGER,
  book_id     INTEGER,
  book_name   TEXT,
  title       TEXT,
  content     TEXT
);

CREATE INDEX IF NOT EXISTS idx_narrator_biography_narrator ON narrator_biography(narrator_id);
CREATE INDEX IF NOT EXISTS idx_narrator_biography_main_id  ON narrator_biography(main_id);
