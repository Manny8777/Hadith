"""
seed_fix_existing.py
Fixes broken existing tables:
1. isnad_hadiths: adds sanad_tahdeth_id from AsanedHadiths.json (f4)
2. hadith_services: adds countries/modrag/kerat/proper_name/matn_comparison from HadithServicesState.json

Field order from Catalog.xml:
  AsanedHadiths:    HadithMainID(f0), BookID(f1), SanadID(f2), SanadType(f3), SanadTahdethID(f4)
  HadithServicesState: HadithMainID(f0), Takhreg(f1), CompoundMatn(f2), Rwah(f3), Asnad(f4),
    Shawahed(f5), Ghareeb(f6), Degree(f7), Sharh(f8), Subjects(f9), Tafsser(f10), Biography(f11),
    Medicine(f12), Feqh(f13), Asbab(f14), Mokhtalaf(f15), Amthal(f16), Kerat(f17), ProperName(f18),
    Countries(f19), MatnComparison(f20), Modrag(f21), Motawater(f22)
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import json, time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data")
DB = dbenv.url()
BATCH = 2000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


def progress(n, total, label):
    if n % 50000 == 0 and n > 0:
        print(f"  ... {n:,}/{total:,} {label}", flush=True)


# ── 1. Fix isnad_hadiths: add sanad_tahdeth_id ───────────────────────────────

print("\n[1/2] Fixing isnad_hadiths.sanad_tahdeth_id ...", flush=True)
t0 = time.time()

with open(DATA / "AsanedHadiths.json", "r", encoding="utf-8") as f:
    rows_raw = json.load(f)

print(f"  Loaded {len(rows_raw):,} rows from AsanedHadiths.json")

# Build update tuples: (sanad_tahdeth_id, hadith_id, isnad_id)
# Primary key of isnad_hadiths is (hadith_id, isnad_id) — match on both
batch = []
total = len(rows_raw)
updated = 0

for i, r in enumerate(rows_raw):
    hadith_id = r.get("f0")
    isnad_id  = r.get("f2")
    tahdeth_id = r.get("f4")
    if hadith_id is None or isnad_id is None:
        continue
    batch.append((tahdeth_id, hadith_id, isnad_id))
    if len(batch) >= BATCH:
        cur.executemany(
            "UPDATE isnad_hadiths SET sanad_tahdeth_id=%s WHERE hadith_id=%s AND isnad_id=%s",
            batch
        )
        conn.commit()
        updated += len(batch)
        batch = []
    progress(i, total, "isnad_hadiths updated")

if batch:
    cur.executemany(
        "UPDATE isnad_hadiths SET sanad_tahdeth_id=%s WHERE hadith_id=%s AND isnad_id=%s",
        batch
    )
    conn.commit()
    updated += len(batch)

print(f"  Updated {updated:,} rows in {time.time()-t0:.0f}s")

# Spot check
cur.execute("SELECT hadith_id, isnad_id, sanad_tahdeth_id FROM isnad_hadiths WHERE sanad_tahdeth_id IS NOT NULL LIMIT 3")
for row in cur.fetchall():
    print(f"    hadith_id={row[0]} isnad_id={row[1]} sanad_tahdeth_id={row[2]}")

cur.execute("SELECT COUNT(*) FROM isnad_hadiths WHERE sanad_tahdeth_id IS NOT NULL")
print(f"  Non-null sanad_tahdeth_id: {cur.fetchone()[0]:,}")


# ── 2. Fix hadith_services: add countries/modrag/kerat/proper_name/matn_comparison ──

print("\n[2/2] Fixing hadith_services flags (countries/modrag/kerat/proper_name/matn_comparison) ...", flush=True)
t0 = time.time()

with open(DATA / "HadithServicesState.json", "r", encoding="utf-8") as f:
    rows_raw = json.load(f)

print(f"  Loaded {len(rows_raw):,} rows from HadithServicesState.json")

# f17=Kerat, f18=ProperName, f19=Countries, f20=MatnComparison, f21=Modrag
batch = []
total = len(rows_raw)
updated = 0

for i, r in enumerate(rows_raw):
    hadith_id = r.get("f0")
    if hadith_id is None:
        continue
    batch.append((
        bool(r.get("f19", False)),  # countries
        bool(r.get("f21", False)),  # modrag
        bool(r.get("f17", False)),  # kerat
        bool(r.get("f18", False)),  # proper_name
        bool(r.get("f20", False)),  # matn_comparison
        hadith_id
    ))
    if len(batch) >= BATCH:
        cur.executemany(
            "UPDATE hadith_services SET countries=%s, modrag=%s, kerat=%s, proper_name=%s, matn_comparison=%s WHERE hadith_id=%s",
            batch
        )
        conn.commit()
        updated += len(batch)
        batch = []
    progress(i, total, "hadith_services updated")

if batch:
    cur.executemany(
        "UPDATE hadith_services SET countries=%s, modrag=%s, kerat=%s, proper_name=%s, matn_comparison=%s WHERE hadith_id=%s",
        batch
    )
    conn.commit()
    updated += len(batch)

print(f"  Updated {updated:,} rows in {time.time()-t0:.0f}s")

cur.execute("SELECT COUNT(*) FROM hadith_services WHERE countries=true")
print(f"  countries=true: {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM hadith_services WHERE modrag=true")
print(f"  modrag=true:    {cur.fetchone()[0]:,}")
cur.execute("SELECT COUNT(*) FROM hadith_services WHERE kerat=true")
print(f"  kerat=true:     {cur.fetchone()[0]:,}")

cur.close()
conn.close()
print("\nDone.")
