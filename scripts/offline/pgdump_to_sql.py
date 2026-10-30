#!/usr/bin/env python3
"""Turn the public pg_dump into plain SQL and COPY data for building the offline PostgreSQL database
(scripts/offline/build-pglite-db.mjs loads the result into PGlite).

    python3 scripts/offline/pgdump_to_sql.py db-backup/hadith-public-YYYY-MM-DD.dump <out dir>

Writes into the output folder:
    pre.sql      extensions, functions, tables, sequences, views (everything but indexes)
    post.sql     constraints and indexes, created after the data is in
    data/*.copy  each table's rows in COPY text format, in pieces of about 48 MB
    files.json   which COPY statement loads which piece

Standard library only (Python 3.9+). Reads pg_dump's custom format directly (archive 1.14-1.16,
gzip or no compression), so no pg_restore of the right major version is needed.
"""
import json
import os
import re
import sys
import zlib

# Never shipped even if a later dump includes them: accounts, sessions, analytics, personal libraries
PRIVATE_TABLES = re.compile(r'^(users|sessions|login_links|login_codes|api_tokens|oauth_.*|page_views|mcp_events|collections|highlights|library_.*|user_.*|admin_.*)$')
PIECE_MAX = 48_000_000

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


def private(e):
    """Anything of a private table: the table, its data, its sequences, constraints and indexes."""
    names = re.findall(r'public\.(\w+)', e['defn'] or '') + [e['tag'] or '']
    return any(PRIVATE_TABLES.match(re.sub(r'_id_seq$', '', n)) for n in names)


def main():
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    dump, out = Dump(sys.argv[1]), sys.argv[2]
    os.makedirs(os.path.join(out, 'data'), exist_ok=True)
    pre, post = [], []
    for e in dump.entries:
        d = e['desc']
        if private(e):
            continue
        if d in ('EXTENSION', 'FUNCTION', 'TABLE', 'SEQUENCE', 'SEQUENCE OWNED BY', 'DEFAULT', 'VIEW', 'COMMENT', 'SEQUENCE SET'):
            if d == 'COMMENT' and 'EXTENSION' in e['defn']:
                continue
            pre.append(e['defn'])
        elif d in ('CONSTRAINT', 'INDEX', 'FK CONSTRAINT'):
            post.append(e['defn'])
    with open(os.path.join(out, 'pre.sql'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(pre))
    with open(os.path.join(out, 'post.sql'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(post))

    files = []
    for e in dump.entries:
        if e['desc'] != 'TABLE DATA' or e['offset'] is None or private(e):
            continue
        n, buf, size = 0, [], 0
        def flush():
            nonlocal n, buf, size
            if not buf:
                return
            name = f"{e['tag']}.{n:03d}.copy"
            with open(os.path.join(out, 'data', name), 'w', encoding='utf-8', newline='\n') as f:
                f.write(''.join(buf))
            files.append({'table': e['tag'], 'copy': e['copy'].split(' FROM')[0], 'file': name})
            n, buf, size = n + 1, [], 0
        for line in dump.copy_lines(e):
            buf.append(line + '\n')
            size += len(line)
            if size > PIECE_MAX:
                flush()
        flush()
    with open(os.path.join(out, 'files.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(files, f)
    print(f'{len(pre)} schema entries, {len(post)} indexes and constraints, {len(files)} data pieces')


if __name__ == '__main__':
    main()
