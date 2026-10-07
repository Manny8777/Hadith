// db/add_library.js
//
// The research library of a signed-in reader (until now saved hadiths, notes and tags lived only in
// the browser's localStorage — one device, lost when cleared):
//
//   collections        named projects («أحاديث النية — بحث الماجستير»), each with a description;
//                      share_token, when set, opens a read-only copy at /library/shared/<token>
//   collection_items   what a collection holds: a hadith, a narrator, a saved search («search», ref =
//                      the query string of /search) or a comparison («compare», ref = the ids), in order
//   library_notes      one note and a set of tags per item a reader has annotated (kind + ref), across
//                      all collections
//   highlights         a passage of a hadith's sanad or matn (character offsets in the displayed text,
//                      and the quoted words), with an optional note
//
// Additive (new tables only); deleting a user deletes all of it (ON DELETE CASCADE).
// Run: node db/add_library.js

const fs = require('fs')
const path = require('path')
const { Pool } = require('pg')

function connectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  const env = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8')
  const m = env.match(/^\s*DATABASE_URL\s*=\s*"?([^"\r\n]+)"?\s*$/m)
  if (!m) throw new Error('DATABASE_URL not found')
  return m[1]
}

const SQL = `
CREATE TABLE IF NOT EXISTS collections (
  id           serial PRIMARY KEY,
  user_id      int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  share_token  text UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_collections_user ON collections(user_id);

CREATE TABLE IF NOT EXISTS collection_items (
  id             serial PRIMARY KEY,
  collection_id  int NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('hadith', 'narrator', 'search', 'compare')),
  ref            text NOT NULL,
  label          text,
  position       double precision NOT NULL DEFAULT 0,
  added_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (collection_id, kind, ref)
);
CREATE INDEX IF NOT EXISTS idx_collection_items_ref ON collection_items(kind, ref);

CREATE TABLE IF NOT EXISTS library_notes (
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        text NOT NULL,
  ref         text NOT NULL,
  body        text NOT NULL DEFAULT '',
  tags        text[] NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, ref)
);

CREATE TABLE IF NOT EXISTS highlights (
  id          serial PRIMARY KEY,
  user_id     int NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hadith_id   int NOT NULL,
  part        text NOT NULL CHECK (part IN ('sanad', 'matn')),
  start_at    int NOT NULL,
  end_at      int NOT NULL,
  quote       text NOT NULL,
  note        text,
  color       text NOT NULL DEFAULT 'gold',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_highlights_user_hadith ON highlights(user_id, hadith_id);
`

async function main() {
  const pool = new Pool({ connectionString: connectionString(), ssl: { rejectUnauthorized: false } })
  await pool.query(SQL)
  const { rows } = await pool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_name IN ('collections','collection_items','library_notes','highlights') ORDER BY 1`)
  console.log('tables:', rows.map(r => r.table_name).join(', '))
  await pool.end()
}
main().catch(e => { console.error(e); process.exit(1) })
