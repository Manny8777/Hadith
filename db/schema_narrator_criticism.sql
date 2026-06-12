-- Narrator criticism/grading table from NounsScientistsSays + NounsScientists
-- ScientistsCriticizeRawi view = JOIN of these two tables filtered by narrator ID

CREATE TABLE IF NOT EXISTS narrator_criticism (
  id          SERIAL PRIMARY KEY,
  narrator_id INTEGER NOT NULL,      -- RawyID (narrator being graded)
  scientist_noun_id INTEGER,         -- ScientistID from NounsScientists (scholar's narrator ID in Nouns)
  scientist_name TEXT,               -- ScientistName
  say_text    TEXT,                  -- Say (the actual grading statement)
  say_sort    INTEGER DEFAULT 0      -- SaySort (display order)
);

CREATE INDEX IF NOT EXISTS idx_narrator_criticism_narrator ON narrator_criticism(narrator_id);
CREATE INDEX IF NOT EXISTS idx_narrator_criticism_scientist ON narrator_criticism(scientist_noun_id);
