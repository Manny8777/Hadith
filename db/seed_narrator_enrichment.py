"""
seed_narrator_enrichment.py
Seeds narrator enrichment tables from data_named/ JSON files:
1. narrator_grading_links  (NounsGarhLinks.json — 139,636 rows)
2. narrator_translation    (NounsTranslation.json — 92,095 rows)
3. narrator_name_forms     (NounsForms.json — 82,757 rows)
4. narrator_teachers       (NounsShyoukhTalamize.json — 147,895 rows)
5. narrator_criticism_links (NounsScientistsSaysLinks.json — ~19,951 rows)

All JSON files use named fields from rename_fields.py output.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import json, time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

# Try data_named first, fall back to data (with positional keys)
DATA_NAMED = Path(r"C:\HadithProg\railway\extract\data_named")
DATA_RAW   = Path(r"C:\HadithProg\railway\extract\data")

DB = dbenv.url()
BATCH = 2000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


def load(name, prefer_named=True):
    if prefer_named:
        p = DATA_NAMED / f"{name}.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    p = DATA_RAW / f"{name}.json"
    with open(p, "r", encoding="utf-8") as f:
        return json.load(f)


# ── 1. narrator_grading_links ─────────────────────────────────────────────────
print("\n[1/5] narrator_grading_links (NounsGarhLinks) ...", flush=True)
t0 = time.time()
rows = load("NounsGarhLinks")
print(f"  {len(rows):,} rows loaded")
sample = rows[0] if rows else {}
has_named = "RawyID" in sample
print(f"  Named fields: {has_named}")

if has_named:
    data = [(r["RawyID"], r.get("GarhID"), r.get("SayID")) for r in rows]
else:
    data = [(r["f0"], r.get("f1"), r.get("f2")) for r in rows]

ev("""
    INSERT INTO narrator_grading_links (rawy_id, garh_id, say_id)
    VALUES %s ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 2. narrator_translation ───────────────────────────────────────────────────
print("\n[2/5] narrator_translation (NounsTranslation) ...", flush=True)
t0 = time.time()
rows = load("NounsTranslation")
print(f"  {len(rows):,} rows loaded")
sample = rows[0] if rows else {}
has_named = "NounID" in sample

if has_named:
    data = [(r["NounID"], r.get("ServiceMainID")) for r in rows]
else:
    data = [(r["f0"], r.get("f1")) for r in rows]

ev("""
    INSERT INTO narrator_translation (noun_id, service_main_id)
    VALUES %s ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 3. narrator_name_forms ────────────────────────────────────────────────────
print("\n[3/5] narrator_name_forms (NounsForms) ...", flush=True)
t0 = time.time()
rows = load("NounsForms")
print(f"  {len(rows):,} rows loaded")
sample = rows[0] if rows else {}
has_named = "ID" in sample

if has_named:
    data = [(r["ID"], r.get("RawyID"), r.get("RawyText"), r.get("RawyTextShape"), r.get("Frequency"), r.get("RawyTextID")) for r in rows]
else:
    data = [(r["f0"], r.get("f1"), r.get("f2"), r.get("f3"), r.get("f4"), r.get("f5")) for r in rows]

ev("""
    INSERT INTO narrator_name_forms (id, rawy_id, rawy_text, rawy_text_shape, frequency, rawy_text_id)
    VALUES %s ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 4. narrator_teachers ──────────────────────────────────────────────────────
print("\n[4/5] narrator_teachers (NounsShyoukhTalamize) ...", flush=True)
t0 = time.time()
rows = load("NounsShyoukhTalamize")
print(f"  {len(rows):,} rows loaded")
sample = rows[0] if rows else {}
has_named = "RawyID" in sample

if has_named:
    data = [(r["RawyID"], r.get("ShyoukhID"), r.get("HadithsCount")) for r in rows]
else:
    data = [(r["f0"], r.get("f1"), r.get("f2")) for r in rows]

ev("""
    INSERT INTO narrator_teachers (rawy_id, shyoukh_id, hadiths_count)
    VALUES %s ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 5. narrator_criticism_links ───────────────────────────────────────────────
print("\n[5/5] narrator_criticism_links (NounsScientistsSaysLinks) ...", flush=True)
t0 = time.time()
try:
    rows = load("NounsScientistsSaysLinks")
    print(f"  {len(rows):,} rows loaded")
    sample = rows[0] if rows else {}
    has_named = "SayID" in sample

    if has_named:
        data = [(r["SayID"], r.get("ServiceMainID"), r.get("LinkID"), bool(r.get("ISBookTocHadith", False))) for r in rows]
    else:
        data = [(r["f0"], r.get("f1"), r.get("f2"), bool(r.get("f3", False))) for r in rows]

    ev("""
        INSERT INTO narrator_criticism_links (say_id, service_main_id, link_id, is_book_toc_hadith)
        VALUES %s ON CONFLICT DO NOTHING
    """, data)
    conn.commit()
    print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")
except FileNotFoundError:
    print("  SKIP: NounsScientistsSaysLinks.json not found (will be extracted separately)")

# ── Summary ──────────────────────────────────────────────────────────────────
print("\n── Row counts ──")
for tbl in ["narrator_grading_links", "narrator_translation", "narrator_name_forms",
            "narrator_teachers", "narrator_criticism_links"]:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {tbl}")
        n = cur.fetchone()[0]
        print(f"  {tbl}: {n:,}")
    except Exception as e:
        print(f"  {tbl}: ERROR {e}")

cur.close()
conn.close()
print("\nDone.")
