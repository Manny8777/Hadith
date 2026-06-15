-- Judgment Hits: links a judgment say to a hadith
CREATE TABLE IF NOT EXISTS hadith_judgment_hits (
  say_id    INTEGER NOT NULL,
  hadith_id INTEGER NOT NULL,
  PRIMARY KEY (say_id, hadith_id)
);
CREATE INDEX IF NOT EXISTS idx_judgment_hits_hadith ON hadith_judgment_hits(hadith_id);

-- Judgment Links: links a judgment say to a service item (book TOC / hadith service)
CREATE TABLE IF NOT EXISTS hadith_judgment_links (
  say_id          INTEGER NOT NULL,
  service_main_id INTEGER NOT NULL,
  is_book_toc     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (say_id, service_main_id)
);
CREATE INDEX IF NOT EXISTS idx_judgment_links_service ON hadith_judgment_links(service_main_id);
