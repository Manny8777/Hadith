#!/usr/bin/env python3
"""Build the offline database (one SQLite file, cut into gzip chunks) from the public pg_dump.

The installed app («تحميل الجامع للعمل دون إنترنت») downloads these chunks, joins them back into one
SQLite file on the device (OPFS) and reads it with SQLite's WebAssembly build. Everything in the
public dump goes in, plus FTS5 search indexes that fold Arabic the way normalize_hadith() does.

    python3 scripts/offline/build_offline_db.py db-backup/hadith-public-YYYY-MM-DD.dump out/offline-db

Writes into the output folder:
    aljami-<version>.sqlite          the whole database (kept for local testing; not uploaded)
    aljami-<version>.part000.gz ...  the chunks to upload (each one an independent gzip file)
    manifest.json                    version, sizes and chunk list; upload it with the chunks

Standard library only (Python 3.9+). Reads pg_dump's custom format directly (archive 1.14-1.16,
gzip or no compression), so no pg_restore of the right major version is needed.
"""
import argparse
import datetime
import gzip
import hashlib
import json
import os
import re
import sqlite3
import sys
import zlib

# Never shipped even if a later dump includes them: accounts, sessions, analytics, personal libraries
PRIVATE_TABLES = re.compile(r'^(users|login_links|login_codes|api_tokens|oauth_.*|page_views|mcp_events|library_.*|user_.*|admin_.*)$')

CHUNK_COMPRESSED_TARGET = 27 * 1000 * 1000   # stays under 30 MB per chunk
CHUNK_RAW_MAX = 256 * 1024 * 1024
READ_STEP = 1024 * 1024


# --- pg_dump custom format ------------------------------------------------------------------

class Dump:
    def __init__(self, path):
        self.f = open(path, 'rb')
        f = self.f
        if f.read(5) != b'PGDMP':
            sys.exit(f'{path} is not a pg_dump custom-format file')
        vmaj, vmin, _vrev, self.intsz, self.offsz, _fmt = f.read(6)
        self.version = (vmaj, vmin)
        if self.version < (1, 14):
            sys.exit(f'archive version {vmaj}.{vmin} is too old (needs pg_dump 14+)')
        self.compressed = f.read(1)[0] != 0 if self.version >= (1, 15) else self.rint() != 0
        for _ in range(7):
            self.rint()
        self.rstr(); self.server = self.rstr(); self.rstr()
        self.entries = [self._entry() for _ in range(self.rint())]

    def rint(self):
        sign = self.f.read(1)[0]
        v = int.from_bytes(self.f.read(self.intsz), 'little')
        return -v if sign else v

    def rstr(self):
        n = self.rint()
        return None if n < 0 else self.f.read(n).decode('utf8', 'replace')

    def _entry(self):
        e = {'id': self.rint()}
        self.rint(); self.rstr(); self.rstr()
        e['tag'] = self.rstr(); e['desc'] = self.rstr(); self.rint()
        e['defn'] = self.rstr() or ''; self.rstr(); e['copy'] = self.rstr() or ''
        e['ns'] = self.rstr(); self.rstr()
        self.rstr()                      # table access method (1.14+)
        if self.version >= (1, 16):
            self.rint()                  # relkind
        self.rstr(); self.rstr()
        while self.rstr() is not None:   # dependencies
            pass
        flag = self.f.read(1)[0]
        off = int.from_bytes(self.f.read(self.offsz), 'little')
        e['offset'] = off if flag == 2 else None
        return e

    def copy_lines(self, entry):
        """Yield the COPY text lines of one TABLE DATA entry."""
        self.f.seek(entry['offset'])
        self.f.read(1); self.rint()
        dz = zlib.decompressobj() if self.compressed else None
        buf = b''
        while True:
            n = self.rint()
            if n == 0:
                break
            data = self.f.read(n)
            buf += dz.decompress(data) if dz else data
            *lines, buf = buf.split(b'\n')
            for line in lines:
                if line and line != b'\\.':
                    yield line.decode('utf8')
        if dz:
            buf += dz.flush()
        for line in buf.split(b'\n'):
            if line and line != b'\\.':
                yield line.decode('utf8')


COPY_ESCAPES = {'t': '\t', 'n': '\n', 'r': '\r', '\\': '\\', 'b': '\b', 'f': '\f', 'v': '\v'}

def unescape(field):
    if field == '\\N':
        return None
    if '\\' not in field:
        return field
    return re.sub(r'\\(.)', lambda m: COPY_ESCAPES.get(m.group(1), m.group(1)), field)


# --- Arabic folding, the same as the database's functions ------------------------------------

TASHKEEL = re.compile('[ً-ٰٟٱ]')
TAGS = re.compile(r'<[^>]*>')
FOLD = str.maketrans('أإآةى', 'اااهي')

def normalize_arabic(s):
    """normalize_arabic(): أ/إ/آ → ا, ة → ه, ى → ي (tashkeel kept)."""
    return s.translate(FOLD) if s is not None else None

def normalize_hadith(s):
    """normalize_hadith(): tashkeel removed, then the same folding."""
    return TASHKEEL.sub('', s or '').translate(FOLD)

def search_text(*parts):
    """What the search indexes hold: the markup stripped, then normalize_hadith()."""
    return normalize_hadith(TAGS.sub(' ', ' '.join(p or '' for p in parts)))


def quote(identifier):
    return '"' + identifier + '"'


# --- schema --------------------------------------------------------------------------------

def parse_columns(create_sql):
    """[(name, sqlite_affinity, is_bool, is_generated)] from a CREATE TABLE statement."""
    body = create_sql[create_sql.index('(') + 1: create_sql.rindex(')')]
    cols = []
    for line in body.split(',\n'):
        line = line.strip()
        m = re.match(r'"?([^"\s]+)"?\s+(.+)', line)
        if not m or m.group(1).upper() in ('CONSTRAINT', 'PRIMARY', 'UNIQUE', 'CHECK'):
            continue
        typ = m.group(2).lower()
        if typ.startswith(('integer', 'bigint', 'smallint', 'serial', 'bigserial', 'boolean')) and '[]' not in typ.split(' ')[0]:
            aff = 'INTEGER'
        elif typ.startswith(('real', 'double', 'numeric', 'decimal')):
            aff = 'REAL'
        else:
            aff = 'TEXT'
        cols.append((m.group(1), aff, typ.startswith('boolean'), 'generated always' in typ))
    return cols


def main():
    sys.stdout.reconfigure(line_buffering=True)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('dump')
    ap.add_argument('out_dir')
    ap.add_argument('--version', help='defaults to the dump file\'s date, e.g. 2026-10-16')
    args = ap.parse_args()

    dump = Dump(args.dump)
    version = args.version or (re.search(r'\d{4}-\d{2}-\d{2}', os.path.basename(args.dump)) or [datetime.date.today().isoformat()])[0]
    os.makedirs(args.out_dir, exist_ok=True)
    db_path = os.path.join(args.out_dir, f'aljami-{version}.sqlite')
    if os.path.exists(db_path):
        os.remove(db_path)
    print(f'dump from PostgreSQL {dump.server}, archive {dump.version[0]}.{dump.version[1]} -> {db_path}')

    db = sqlite3.connect(db_path)
    db.execute('PRAGMA page_size = 4096')
    db.execute('PRAGMA journal_mode = OFF')
    db.execute('PRAGMA synchronous = OFF')

    tables = {e['tag']: e for e in dump.entries if e['desc'] == 'TABLE' and not PRIVATE_TABLES.match(e['tag'])}
    schemas = {}
    for name, e in tables.items():
        cols = parse_columns(e['defn'])
        schemas[name] = cols
        db.execute(f'CREATE TABLE "{name}" ({", ".join(quote(c) + " " + a for c, a, _, _ in cols)})')

    # Rows
    for e in dump.entries:
        if e['desc'] != 'TABLE DATA' or e['tag'] not in tables or e['offset'] is None:
            continue
        name = e['tag']
        copy_cols = [c.strip().strip('"') for c in re.search(r'\((.*)\)', e['copy']).group(1).split(',')]
        info = {c: (a, b) for c, a, b, _ in schemas[name]}
        bools = [i for i, c in enumerate(copy_cols) if info.get(c, ('', False))[1]]
        ints = [i for i, c in enumerate(copy_cols) if info.get(c, ('',))[0] == 'INTEGER' and i not in bools]
        insert = f'INSERT INTO "{name}" ({", ".join(quote(c) for c in copy_cols)}) VALUES ({",".join("?" * len(copy_cols))})'

        def rows():
            for line in dump.copy_lines(e):
                vals = [unescape(v) for v in line.split('\t')]
                for i in bools:
                    if vals[i] is not None:
                        vals[i] = 1 if vals[i] == 't' else 0
                for i in ints:
                    if vals[i] is not None:
                        try:
                            vals[i] = int(vals[i])
                        except ValueError:
                            raise SystemExit(f'{name}.{copy_cols[i]}: {vals[i]!r} in {line[:200]!r}')
                yield vals
        db.executemany(insert, rows())
        db.commit()
        count = db.execute('SELECT COUNT(*) FROM ' + quote(name)).fetchone()[0]
        print(f'  {name}: {count:,} rows')

    # Generated columns are not in the dump: narrators.name_normalized = normalize_arabic(name)
    for name, cols in schemas.items():
        for c, _, _, generated in cols:
            if generated and name == 'narrators' and c == 'name_normalized':
                db.create_function('normalize_arabic', 1, normalize_arabic, deterministic=True)
                db.execute('UPDATE narrators SET name_normalized = normalize_arabic(name)')
                db.commit()

    # Keys and the plain btree indexes the site already relies on
    made = 0
    for e in dump.entries:
        d = e['defn']
        m = re.search(r'ALTER TABLE ONLY public\.(\w+)\s+ADD CONSTRAINT (\w+) (?:PRIMARY KEY|UNIQUE) \(([\w, ]+)\)', d)
        if e['desc'] == 'CONSTRAINT' and m and m.group(1) in tables:
            db.execute(f'CREATE UNIQUE INDEX IF NOT EXISTS "{m.group(2)}" ON "{m.group(1)}" ({m.group(3)})'); made += 1
        m = re.match(r'\s*CREATE (UNIQUE )?INDEX (\S+) ON public\.(\w+) USING btree \(([\w, ]+)\)', d)
        if e['desc'] == 'INDEX' and m and m.group(3) in tables:
            db.execute(f'CREATE {m.group(1) or ""}INDEX IF NOT EXISTS "{m.group(2)}" ON "{m.group(3)}" ({m.group(4)})'); made += 1
    # …and the lookups the offline reader makes
    for table, cols in [
        ('hadith_toc', 'book_id, parent_id, left_value'), ('hadith_toc', 'book_id, is_leaf, left_value'),
        ('isnad_hadiths', 'hadith_id'), ('hadith_judgments', 'hadith_id'), ('dorar_rulings', 'book_id, number'),
        ('narrator_biography', 'narrator_id'), ('narrator_criticism', 'narrator_id'),
        ('narrator_teachers', 'rawy_id'), ('narrator_teachers', 'shyoukh_id'), ('narrator_books', 'narrator_id'),
        ('quran_ayat', 'sora_id, aya_num'), ('hadith_service_content', 'book_id, parent_id, left_value'),
    ]:
        if table in tables:
            name = 'offline_' + table + '_' + cols.replace(', ', '_')
            db.execute(f'CREATE INDEX IF NOT EXISTS "{name}" ON "{table}" ({cols})'); made += 1
    db.commit()
    print(f'  {made} indexes')

    # Search (FTS5, contentless: rowid points back at the row)
    tok = "tokenize = 'unicode61 remove_diacritics 0'"
    fts = [
        ('hadith_fts', "SELECT main_id, tarf, content FROM hadith_toc WHERE is_leaf = 1", 2),
        ('tarf_fts', "SELECT main_id, tarf FROM hadith_toc WHERE is_leaf = 1 AND tarf IS NOT NULL AND tarf <> ''", 1),
        ('service_fts', "SELECT id, tarf, content FROM hadith_service_content WHERE is_leaf = 1", 2),
        ('bio_fts', "SELECT id, title, content FROM narrator_biography", 2),
        ('narrator_fts', "SELECT id, name, abb_name, kunia, laqab, esm_shuhra FROM narrators", 5),
    ]
    for name, sql, nparts in fts:
        source = sql.split(' FROM ')[1].split()[0]
        if source not in tables:
            continue
        db.execute(f"CREATE VIRTUAL TABLE {name} USING fts5(t, content='', {tok})")
        db.executemany(f'INSERT INTO {name}(rowid, t) VALUES (?, ?)',
                       ((r[0], search_text(*r[1:1 + nparts])) for r in db.execute(sql).fetchall()))
        db.execute(f"INSERT INTO {name}({name}) VALUES ('optimize')")
        db.commit()
        print(f'  search index {name}')

    db.execute('CREATE TABLE offline_meta (key TEXT PRIMARY KEY, value TEXT)')
    db.executemany('INSERT INTO offline_meta VALUES (?, ?)', [
        ('version', version), ('built_at', datetime.datetime.now(datetime.timezone.utc).isoformat()),
        ('source_server', dump.server),
    ])
    db.commit()
    db.execute('PRAGMA journal_mode = DELETE')   # the device opens it read-only; no WAL file to carry
    db.execute('VACUUM')
    db.execute('ANALYZE')
    db.close()

    # Chunks: independent gzip files, cut so each stays under ~27 MB compressed
    size = os.path.getsize(db_path)
    chunks, sha = [], hashlib.sha256()
    with open(db_path, 'rb') as src:
        offset = 0
        while offset < size:
            name = f'aljami-{version}.part{len(chunks):03d}.gz'
            path = os.path.join(args.out_dir, name)
            raw = 0
            comp = zlib.compressobj(6, zlib.DEFLATED, 31)   # 31 = gzip wrapper
            out = open(path, 'wb')
            written = 0
            while raw < CHUNK_RAW_MAX:
                data = src.read(READ_STEP)
                if not data:
                    break
                sha.update(data)
                raw += len(data)
                written += out.write(comp.compress(data))
                if written >= CHUNK_COMPRESSED_TARGET - 2 * READ_STEP:
                    break
            out.write(comp.flush())
            out.close()
            chunks.append({'name': name, 'offset': offset, 'size': raw, 'gzSize': os.path.getsize(path)})
            offset += raw
    manifest = {
        'version': version,
        'format': 1,
        'dbFile': f'aljami-{version}.sqlite',
        'dbSize': size,
        'sha256': sha.hexdigest(),
        'downloadSize': sum(c['gzSize'] for c in chunks),
        'chunks': chunks,
    }
    with open(os.path.join(args.out_dir, 'manifest.json'), 'w') as f:
        json.dump(manifest, f, indent=1)
    print(f'{size / 1e9:.2f} GB database, {len(chunks)} chunks, {manifest["downloadSize"] / 1e9:.2f} GB to download')


if __name__ == '__main__':
    main()
