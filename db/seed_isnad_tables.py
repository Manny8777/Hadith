"""
seed_isnad_tables.py — creates and seeds the 4 isnad supplementary tables.

Tables seeded in order:
  1. isnad_relation_types  (AsanedRelationsTypes.json — tiny reference data)
  2. isnad_relations        (AsanedRelations.json      — ~52 MB)
  3. isnad_tahdeth          (AsanedTahdeth.json         — ~26 MB)
  4. isnad_tree             (AsanedTree.json            — ~162 MB, streamed)

Usage:
  python "C:\\HadithProg\\railway\\db\\seed_isnad_tables.py"
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import json, time, sys
import psycopg2
import psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data_named")
DB   = dbenv.url()
BATCH = 1000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()

# ─── Helper ──────────────────────────────────────────────────────────────────

def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


def load_json(name):
    print(f"  Loading {name}.json ...", flush=True)
    with open(DATA / f"{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def stream_json(name):
    """Stream a JSON array file object-by-object using ijson if available,
    else fall back to full json.load (fine for <200 MB when RAM allows)."""
    try:
        import ijson
        with open(DATA / f"{name}.json", "rb") as f:
            yield from ijson.items(f, "item")
    except ImportError:
        print("  (ijson not available, falling back to json.load)", flush=True)
        with open(DATA / f"{name}.json", "r", encoding="utf-8") as f:
            for item in json.load(f):
                yield item


# ─── Apply schema ─────────────────────────────────────────────────────────────

print("\n[1/5] Applying schema ...", flush=True)
schema_path = Path(r"C:\HadithProg\railway\db\schema_isnad_tables.sql")
with open(schema_path, "r", encoding="utf-8") as f:
    schema_sql = f.read()
cur.execute(schema_sql)
conn.commit()
print("  Schema applied.", flush=True)


# ─── 1. isnad_relation_types ─────────────────────────────────────────────────

print("\n[2/5] Seeding isnad_relation_types ...", flush=True)
rows = load_json("AsanedRelationsTypes")
# Fields: ID, Text
data = [(r["ID"], r.get("Text")) for r in rows]
ev("""
    INSERT INTO isnad_relation_types (id, text)
    VALUES %s
    ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data)} rows inserted.", flush=True)


# ─── 2. isnad_relations ───────────────────────────────────────────────────────

print("\n[3/5] Seeding isnad_relations ...", flush=True)
rows = load_json("AsanedRelations")
# Fields: ID, HadithMainID, SandID, RelationID, Rwah
data = [
    (
        r["ID"],
        r.get("HadithMainID"),
        r.get("SandID"),
        r.get("RelationID"),
        r.get("Rwah", "").strip() if r.get("Rwah") else None,
    )
    for r in rows
]
ev("""
    INSERT INTO isnad_relations (id, hadith_main_id, sand_id, relation_id, rwah)
    VALUES %s
    ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data)} rows inserted.", flush=True)


# ─── 3. isnad_tahdeth ─────────────────────────────────────────────────────────

print("\n[4/5] Seeding isnad_tahdeth ...", flush=True)
rows = load_json("AsanedTahdeth")
# Fields: ID, SandTahdeth
data = [
    (
        r["ID"],
        r.get("SandTahdeth", "").strip() if r.get("SandTahdeth") else None,
    )
    for r in rows
]
ev("""
    INSERT INTO isnad_tahdeth (id, sand_tahdeth)
    VALUES %s
    ON CONFLICT DO NOTHING
""", data)
conn.commit()
print(f"  {len(data)} rows inserted.", flush=True)


# ─── 4. isnad_tree (streamed, largest file) ───────────────────────────────────

print("\n[5/5] Seeding isnad_tree (streaming) ...", flush=True)
t0 = time.time()
batch = []
count = 0

def flush_tree():
    ev("""
        INSERT INTO isnad_tree
            (id, name, parent_id, is_leaf, left_value, right_value,
             rawy_id, is_marfoa, is_mawkof, is_maktoa, is_marfoa_hokm)
        VALUES %s
        ON CONFLICT DO NOTHING
    """, batch)
    conn.commit()

for r in stream_json("AsanedTree"):
    batch.append((
        r["ID"],
        r.get("Name"),
        r.get("ParentID"),
        bool(r.get("IsLeaf")),
        r.get("LeftValue"),
        r.get("RightValue"),
        r.get("RawyID"),
        bool(r.get("isMarfoa")),
        bool(r.get("isMawkof")),
        bool(r.get("isMaktoa")),
        bool(r.get("isMarfoaHokm")),
    ))
    count += 1
    if len(batch) >= BATCH:
        flush_tree()
        batch = []
        if count % 50000 == 0:
            elapsed = time.time() - t0
            print(f"  ... {count:,} rows ({elapsed:.0f}s)", flush=True)

if batch:
    flush_tree()

elapsed = time.time() - t0
print(f"  {count:,} rows inserted in {elapsed:.1f}s.", flush=True)


# ─── Final row counts ─────────────────────────────────────────────────────────

print("\n─── Final row counts ───────────────────────────────────────", flush=True)
for table in ["isnad_relation_types", "isnad_relations", "isnad_tahdeth", "isnad_tree"]:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    n = cur.fetchone()[0]
    print(f"  {table}: {n:,}", flush=True)

cur.close()
conn.close()
print("\nDone.", flush=True)
