"""
seed_takhrij.py — loads HTakhreeg.json into takhrij table
Batch size 1000, ON CONFLICT DO NOTHING
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv
import json, time, sys
import psycopg2
import psycopg2.extras
from pathlib import Path

DB = dbenv.url()
DATA_FILE = Path(r"C:\HadithProg\railway\extract\data_named\HTakhreeg.json")

print("Loading HTakhreeg.json ...", flush=True)
t0 = time.time()
rows = json.load(open(DATA_FILE, encoding='utf-8'))
print(f"Loaded {len(rows)} rows in {time.time()-t0:.1f}s", flush=True)

conn = psycopg2.connect(DB, connect_timeout=30, sslmode='require')
conn.autocommit = False
cur = conn.cursor()

BATCH = 1000
total = len(rows)
inserted = 0

print("Seeding takhrij table ...", flush=True)
t1 = time.time()

for i in range(0, total, BATCH):
    chunk = rows[i:i+BATCH]
    data = [
        (
            r["HadithMainID"],
            r["GroupID"],
            r.get("CompoundMatnID"),
            r.get("BookID"),
        )
        for r in chunk
    ]
    psycopg2.extras.execute_values(
        cur,
        """INSERT INTO takhrij (hadith_id, group_id, compound_matn_id, book_id)
           VALUES %s ON CONFLICT DO NOTHING""",
        data,
        page_size=BATCH
    )
    conn.commit()
    inserted += len(chunk)
    if inserted % 20000 == 0 or inserted >= total:
        elapsed = time.time() - t1
        print(f"  {inserted}/{total} ({elapsed:.0f}s)", flush=True)

cur.close()
conn.close()

elapsed_total = time.time() - t0
print(f"\nDone. {inserted} rows processed in {elapsed_total:.1f}s total", flush=True)
