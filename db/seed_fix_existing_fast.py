"""
seed_fix_existing_fast.py
Fast version using temp table + single UPDATE FROM:
1. isnad_hadiths: add sanad_tahdeth_id
2. hadith_services: add countries/modrag/kerat/proper_name/matn_comparison
"""
import json, time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
BATCH = 5000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=60)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


# ── 1. Fix isnad_hadiths.sanad_tahdeth_id ─────────────────────────────────────
print("[1/2] isnad_hadiths.sanad_tahdeth_id ...", flush=True)
t0 = time.time()

# Create temp table
cur.execute("DROP TABLE IF EXISTS _tmp_tahdeth")
cur.execute("""
    CREATE TEMP TABLE _tmp_tahdeth (
        hadith_id    INTEGER,
        isnad_id     INTEGER,
        tahdeth_id   INTEGER
    )
""")
conn.commit()

with open(DATA / "AsanedHadiths.json", "r", encoding="utf-8") as f:
    rows_raw = json.load(f)

print(f"  Loaded {len(rows_raw):,} rows", flush=True)

# Insert into temp table in batches
batch = []
for r in rows_raw:
    hadith_id  = r.get("f0")
    isnad_id   = r.get("f2")
    tahdeth_id = r.get("f4")
    if hadith_id is None or isnad_id is None:
        continue
    batch.append((hadith_id, isnad_id, tahdeth_id))
    if len(batch) >= BATCH:
        ev("INSERT INTO _tmp_tahdeth VALUES %s", batch)
        batch = []

if batch:
    ev("INSERT INTO _tmp_tahdeth VALUES %s", batch)
conn.commit()

cur.execute("SELECT COUNT(*) FROM _tmp_tahdeth")
print(f"  Inserted {cur.fetchone()[0]:,} rows in temp table ({time.time()-t0:.1f}s)", flush=True)

# Single UPDATE from temp table
print("  Running UPDATE FROM temp table ...", flush=True)
t1 = time.time()
cur.execute("""
    UPDATE isnad_hadiths ih
    SET sanad_tahdeth_id = t.tahdeth_id
    FROM _tmp_tahdeth t
    WHERE ih.hadith_id = t.hadith_id AND ih.isnad_id = t.isnad_id
""")
updated = cur.rowcount
conn.commit()
print(f"  Updated {updated:,} rows in {time.time()-t1:.1f}s (total: {time.time()-t0:.1f}s)", flush=True)

cur.execute("SELECT COUNT(*) FROM isnad_hadiths WHERE sanad_tahdeth_id IS NOT NULL")
print(f"  Non-null sanad_tahdeth_id: {cur.fetchone()[0]:,}", flush=True)


# ── 2. Fix hadith_services flags ─────────────────────────────────────────────
print("\n[2/2] hadith_services flags ...", flush=True)
t0 = time.time()

cur.execute("DROP TABLE IF EXISTS _tmp_svc")
cur.execute("""
    CREATE TEMP TABLE _tmp_svc (
        hadith_id       INTEGER,
        countries       BOOLEAN,
        modrag          BOOLEAN,
        kerat           BOOLEAN,
        proper_name     BOOLEAN,
        matn_comparison BOOLEAN
    )
""")
conn.commit()

with open(DATA / "HadithServicesState.json", "r", encoding="utf-8") as f:
    rows_raw = json.load(f)

print(f"  Loaded {len(rows_raw):,} rows", flush=True)

# f17=Kerat, f18=ProperName, f19=Countries, f20=MatnComparison, f21=Modrag
batch = []
for r in rows_raw:
    hadith_id = r.get("f0")
    if hadith_id is None:
        continue
    batch.append((
        hadith_id,
        bool(r.get("f19", False)),
        bool(r.get("f21", False)),
        bool(r.get("f17", False)),
        bool(r.get("f18", False)),
        bool(r.get("f20", False)),
    ))
    if len(batch) >= BATCH:
        ev("INSERT INTO _tmp_svc VALUES %s", batch)
        batch = []

if batch:
    ev("INSERT INTO _tmp_svc VALUES %s", batch)
conn.commit()

cur.execute("SELECT COUNT(*) FROM _tmp_svc")
print(f"  Inserted {cur.fetchone()[0]:,} rows in temp table ({time.time()-t0:.1f}s)", flush=True)

t1 = time.time()
cur.execute("""
    UPDATE hadith_services hs
    SET countries       = t.countries,
        modrag          = t.modrag,
        kerat           = t.kerat,
        proper_name     = t.proper_name,
        matn_comparison = t.matn_comparison
    FROM _tmp_svc t
    WHERE hs.hadith_id = t.hadith_id
""")
updated = cur.rowcount
conn.commit()
print(f"  Updated {updated:,} rows in {time.time()-t1:.1f}s (total: {time.time()-t0:.1f}s)", flush=True)

for col in ["countries", "modrag", "kerat", "proper_name", "matn_comparison"]:
    cur.execute(f"SELECT COUNT(*) FROM hadith_services WHERE {col}=true")
    print(f"  {col}=true: {cur.fetchone()[0]:,}", flush=True)

cur.close()
conn.close()
print("\nDone.")
