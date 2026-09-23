"""
seed_pages.py — seeds the pages table (912,900 rows) using streaming JSON
Fields: MainID, PartNum, PageNum, PageID, NextPageID, PrevPageID
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

try:
    import ijson
    USE_IJSON = True
except ImportError:
    USE_IJSON = False

DATA_NAMED = Path(r"C:\HadithProg\railway\extract\data_named")
DATA_RAW   = Path(r"C:\HadithProg\railway\extract\data")

DB = dbenv.url()
BATCH = 2000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()

# Find the JSON file
json_path = None
for base in [DATA_NAMED, DATA_RAW]:
    p = base / "Pages.json"
    if p.exists():
        json_path = p
        print(f"Using: {p}")
        break

if not json_path:
    print("ERROR: Pages.json not found")
    sys.exit(1)

print(f"Using ijson: {USE_IJSON}")
print("Seeding pages table ...", flush=True)

t0 = time.time()
batch = []
count = 0

def flush():
    psycopg2.extras.execute_values(cur, """
        INSERT INTO pages (main_id, part_num, page_num, page_id, next_page_id, prev_page_id)
        VALUES %s ON CONFLICT DO NOTHING
    """, batch, page_size=BATCH)
    conn.commit()


def get_val(r, named_key, pos_key, default=None):
    if named_key in r:
        return r.get(named_key, default)
    return r.get(pos_key, default)


if USE_IJSON:
    with open(json_path, "rb") as f:
        for r in ijson.items(f, "item"):
            batch.append((
                get_val(r, "MainID",      "f0"),
                get_val(r, "PartNum",     "f1"),
                get_val(r, "PageNum",     "f2"),
                get_val(r, "PageID",      "f3"),
                get_val(r, "NextPageID",  "f4"),
                get_val(r, "PrevPageID",  "f5"),
            ))
            count += 1
            if len(batch) >= BATCH:
                flush()
                batch = []
                if count % 50000 == 0:
                    elapsed = time.time() - t0
                    rate = count / elapsed
                    eta = (912900 - count) / rate
                    print(f"  {count:,}/912,900 ({elapsed:.0f}s elapsed, ~{eta:.0f}s remaining)", flush=True)
else:
    import json
    with open(json_path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    print(f"  Loaded {len(rows):,} rows")
    for r in rows:
        batch.append((
            get_val(r, "MainID",      "f0"),
            get_val(r, "PartNum",     "f1"),
            get_val(r, "PageNum",     "f2"),
            get_val(r, "PageID",      "f3"),
            get_val(r, "NextPageID",  "f4"),
            get_val(r, "PrevPageID",  "f5"),
        ))
        count += 1
        if len(batch) >= BATCH:
            flush()
            batch = []
            if count % 50000 == 0:
                elapsed = time.time() - t0
                print(f"  {count:,} rows ({elapsed:.0f}s)", flush=True)

if batch:
    flush()

elapsed = time.time() - t0
print(f"\nInserted {count:,} rows in {elapsed:.0f}s")

cur.execute("SELECT COUNT(*) FROM pages")
db_count = cur.fetchone()[0]
print(f"DB count: {db_count:,}")

cur.close()
conn.close()
print("Done.")
