"""
seed_structure_tables.py
Seeds book/content structure tables:
1. sections               (Sections.json — 25 rows)
2. section_books          (SectionBooks.json — 90 rows)
3. isnad_tahdeth_types    (AsanedTahdethTypes.json — 985 rows)
4. isnad_types            (AsanedTypes.json — 9 rows)
5. hadith_expressions_tree  (HadithExpressionsTree.json)
6. hadith_expressions_hits  (HadithExpressionsHits.json)
7. hadith_expressions_says  (HadithExpressionsSays.json)
8. hadith_controversial_tree (HadithControversialTree.json)
9. hadith_controversial_descriptions (HadithControverialDescrp.json)
10. hadith_compound_matn  (HCompoundMatn.json — 16,640 rows)
11. hadith_group_matn     (HGamhAlMatn.json — 347,141 rows)
12. book_extra            (BookExtra.json)
13. hadith_judgment_scientists (HadithJudgmentScientists.json)
14. hadith_ghareeb        (HadithGhareeb.json)
15. hadith_modrag         (HadithModrag.json)
16. hadith_shawahed       (HadithShawahed.json)
17. narrator_mutual_narrators (ExpRawyModbaj.json — 1,292 rows)
"""

import json, time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

DATA_NAMED = Path(r"C:\HadithProg\railway\extract\data_named")
DATA_RAW   = Path(r"C:\HadithProg\railway\extract\data")

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
BATCH = 1000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


def load(name):
    for base in [DATA_NAMED, DATA_RAW]:
        p = base / f"{name}.json"
        if p.exists():
            with open(p, "r", encoding="utf-8") as f:
                data = json.load(f)
            named = data and (list(data[0].keys())[0] if data else "f0")[0] != "f"
            return data, named
    raise FileNotFoundError(f"{name}.json not found")


def n(r, named_key, pos_key):
    return r.get(named_key) if named_key in r else r.get(pos_key)


def nb(r, named_key, pos_key):
    v = r.get(named_key) if named_key in r else r.get(pos_key)
    return bool(v)


# ── 1. sections ───────────────────────────────────────────────────────────────
print("\n[1/17] sections ...", flush=True)
try:
    rows, _ = load("Sections")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(
        r["ID"] if named else r["f0"],
        r.get("Name")       if named else r.get("f1"),
        r.get("ParentID")   if named else r.get("f2"),
        bool(r.get("IsLeaf", False) if named else r.get("f3", False)),
        r.get("LeftValue")  if named else r.get("f4"),
        r.get("RightValue") if named else r.get("f5"),
    ) for r in rows]
    ev("INSERT INTO sections (id, name, parent_id, is_leaf, left_value, right_value) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 2. section_books ──────────────────────────────────────────────────────────
print("\n[2/17] section_books ...", flush=True)
try:
    rows, _ = load("SectionBooks")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(
        r["ID"] if named else r["f0"],
        r.get("BookID")    if named else r.get("f1"),
        r.get("SectionID") if named else r.get("f2"),
    ) for r in rows]
    ev("INSERT INTO section_books (id, book_id, section_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 3. isnad_tahdeth_types ────────────────────────────────────────────────────
print("\n[3/17] isnad_tahdeth_types (AsanedTahdethTypes) ...", flush=True)
try:
    rows, _ = load("AsanedTahdethTypes")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(r["ID"] if named else r["f0"], r.get("Text") if named else r.get("f1")) for r in rows]
    ev("INSERT INTO isnad_tahdeth_types (id, text) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 4. isnad_types ────────────────────────────────────────────────────────────
print("\n[4/17] isnad_types (AsanedTypes) ...", flush=True)
try:
    rows, _ = load("AsanedTypes")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(r["ID"] if named else r["f0"], r.get("Text") if named else r.get("f1")) for r in rows]
    ev("INSERT INTO isnad_types (id, text) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 5. hadith_expressions_tree ────────────────────────────────────────────────
print("\n[5/17] hadith_expressions_tree ...", flush=True)
try:
    rows, _ = load("HadithExpressionsTree")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(
        r["ID"] if named else r["f0"],
        r.get("Text")       if named else r.get("f1"),
        r.get("ParentID")   if named else r.get("f2"),
        bool(r.get("IsLeaf", False) if named else r.get("f3", False)),
        r.get("LeftValue")  if named else r.get("f4"),
        r.get("RightValue") if named else r.get("f5"),
        r.get("NodeID")     if named else r.get("f6"),
        bool(r.get("IsMatn", False) if named else r.get("f7", False)),
        bool(r.get("IsSand", False) if named else r.get("f8", False)),
        bool(r.get("IsRawy", False) if named else r.get("f9", False)),
        bool(r.get("IsColored", False) if named else r.get("f10", False)),
    ) for r in rows]
    ev("INSERT INTO hadith_expressions_tree (id, text, parent_id, is_leaf, left_value, right_value, node_id, is_matn, is_sand, is_rawy, is_colored) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 6. hadith_expressions_hits ────────────────────────────────────────────────
print("\n[6/17] hadith_expressions_hits ...", flush=True)
try:
    rows, _ = load("HadithExpressionsHits")
    sample = rows[0] if rows else {}
    named = "NodeID" in sample
    data = [(r["NodeID"] if named else r["f0"], r.get("HitID") if named else r.get("f1")) for r in rows]
    ev("INSERT INTO hadith_expressions_hits (node_id, hit_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 7. hadith_expressions_says ────────────────────────────────────────────────
print("\n[7/17] hadith_expressions_says ...", flush=True)
try:
    rows, _ = load("HadithExpressionsSays")
    sample = rows[0] if rows else {}
    named = "NodeID" in sample
    data = [(
        r["NodeID"] if named else r["f0"],
        r.get("ScientistID")    if named else r.get("f1"),
        r.get("Say")            if named else r.get("f2"),
        r.get("ServiceMainID")  if named else r.get("f3"),
        r.get("LinkID")         if named else r.get("f4"),
    ) for r in rows]
    ev("INSERT INTO hadith_expressions_says (node_id, scientist_id, say, service_main_id, link_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 8. hadith_controversial_tree ──────────────────────────────────────────────
print("\n[8/17] hadith_controversial_tree ...", flush=True)
try:
    rows, _ = load("HadithControversialTree")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(
        r["ID"] if named else r["f0"],
        r.get("Text")       if named else r.get("f1"),
        r.get("ParentID")   if named else r.get("f2"),
        bool(r.get("IsLeaf", False) if named else r.get("f3", False)),
        r.get("LeftValue")  if named else r.get("f4"),
        r.get("RightValue") if named else r.get("f5"),
        r.get("NodeID")     if named else r.get("f6"),
        bool(r.get("IsColored", False) if named else r.get("f7", False)),
    ) for r in rows]
    ev("INSERT INTO hadith_controversial_tree (id, text, parent_id, is_leaf, left_value, right_value, node_id, is_colored) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 9. hadith_controversial_descriptions ─────────────────────────────────────
print("\n[9/17] hadith_controversial_descriptions ...", flush=True)
try:
    rows, _ = load("HadithControverialDescrp")
    sample = rows[0] if rows else {}
    named = "NodeID" in sample
    data = [(r["NodeID"] if named else r["f0"], r.get("ServiceMainID") if named else r.get("f1")) for r in rows]
    ev("INSERT INTO hadith_controversial_descriptions (node_id, service_main_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 10. hadith_compound_matn ──────────────────────────────────────────────────
print("\n[10/17] hadith_compound_matn (HCompoundMatn) ...", flush=True)
try:
    rows, _ = load("HCompoundMatn")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(
        r["ID"] if named else r["f0"],
        r.get("Matn")          if named else r.get("f1"),
        r.get("HadithMainID")  if named else r.get("f2"),
        r.get("AsanedComp")    if named else r.get("f3"),
    ) for r in rows]
    ev("INSERT INTO hadith_compound_matn (id, matn, hadith_main_id, asaned_comp) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 11. hadith_group_matn ─────────────────────────────────────────────────────
print("\n[11/17] hadith_group_matn (HGamhAlMatn) ...", flush=True)
t0 = time.time()
try:
    rows, _ = load("HGamhAlMatn")
    sample = rows[0] if rows else {}
    named = "HadithMainID" in sample
    data = [(
        r["HadithMainID"] if named else r["f0"],
        r.get("GroupID")  if named else r.get("f1"),
        r.get("BookID")   if named else r.get("f2"),
    ) for r in rows]
    # Insert in batches for large table
    for i in range(0, len(data), BATCH * 10):
        chunk = data[i:i + BATCH * 10]
        ev("INSERT INTO hadith_group_matn (hadith_main_id, group_id, book_id) VALUES %s ON CONFLICT DO NOTHING", chunk)
        conn.commit()
        if i % 100000 == 0 and i > 0:
            print(f"  ... {i:,}/{len(data):,} in {time.time()-t0:.0f}s")
    print(f"  {len(data):,} rows in {time.time()-t0:.0f}s")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 12. book_extra ────────────────────────────────────────────────────────────
print("\n[12/17] book_extra ...", flush=True)
try:
    rows, _ = load("BookExtra")
    sample = rows[0] if rows else {}
    named = "BookID" in sample
    data = [(
        r["BookID"] if named else r["f0"],
        r.get("RawyID")   if named else r.get("f1"),
        r.get("RawyName") if named else r.get("f2"),
        r.get("Count")    if named else r.get("f3"),
    ) for r in rows]
    ev("INSERT INTO book_extra (book_id, rawy_id, rawy_name, count) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 13. hadith_judgment_scientists ────────────────────────────────────────────
print("\n[13/17] hadith_judgment_scientists ...", flush=True)
try:
    rows, _ = load("HadithJudgmentScientists")
    sample = rows[0] if rows else {}
    named = "ID" in sample
    data = [(r["ID"] if named else r["f0"], r.get("Name") if named else r.get("f1")) for r in rows]
    ev("INSERT INTO hadith_judgment_scientists (id, name) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 14. hadith_ghareeb ────────────────────────────────────────────────────────
print("\n[14/17] hadith_ghareeb ...", flush=True)
try:
    rows, _ = load("HadithGhareeb")
    sample = rows[0] if rows else {}
    named = "HadithMainID" in sample
    data = [(r["HadithMainID"] if named else r["f0"],) for r in rows]
    ev("INSERT INTO hadith_ghareeb (hadith_main_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 15. hadith_modrag ─────────────────────────────────────────────────────────
print("\n[15/17] hadith_modrag ...", flush=True)
try:
    rows, _ = load("HadithModrag")
    sample = rows[0] if rows else {}
    named = "HadithMainID" in sample
    data = [(r["HadithMainID"] if named else r["f0"],) for r in rows]
    ev("INSERT INTO hadith_modrag (hadith_main_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 16. hadith_shawahed ───────────────────────────────────────────────────────
print("\n[16/17] hadith_shawahed ...", flush=True)
try:
    rows, _ = load("HadithShawahed")
    sample = rows[0] if rows else {}
    named = "HadithMainID" in sample
    data = [(r["HadithMainID"] if named else r["f0"],) for r in rows]
    ev("INSERT INTO hadith_shawahed (hadith_main_id) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── 17. narrator_mutual_narrators (ExpRawyModbaj) ─────────────────────────────
print("\n[17/17] narrator_mutual_narrators (ExpRawyModbaj) ...", flush=True)
try:
    rows, _ = load("ExpRawyModbaj")
    sample = rows[0] if rows else {}
    named = "PrID" in sample
    data = [(
        r["PrID"] if named else r["f0"],
        r.get("ShyoukhID") if named else r.get("f1"),
        r.get("ShName")    if named else r.get("f2"),
        r.get("RawyID")    if named else r.get("f3"),
        r.get("RName")     if named else r.get("f4"),
    ) for r in rows]
    ev("INSERT INTO narrator_mutual_narrators (pr_id, shyoukh_id, sh_name, rawy_id, r_name) VALUES %s ON CONFLICT DO NOTHING", data)
    conn.commit()
    print(f"  {len(data):,} rows")
except FileNotFoundError as e:
    print(f"  SKIP: {e}")

# ── Summary ──────────────────────────────────────────────────────────────────
print("\n── Row counts ──")
for tbl in ["sections","section_books","isnad_tahdeth_types","isnad_types",
            "hadith_expressions_tree","hadith_expressions_hits","hadith_expressions_says",
            "hadith_controversial_tree","hadith_controversial_descriptions",
            "hadith_compound_matn","hadith_group_matn","book_extra",
            "hadith_judgment_scientists","hadith_ghareeb","hadith_modrag","hadith_shawahed",
            "narrator_mutual_narrators"]:
    try:
        cur.execute(f"SELECT COUNT(*) FROM {tbl}")
        print(f"  {tbl}: {cur.fetchone()[0]:,}")
    except Exception as e:
        print(f"  {tbl}: ERROR - {e}")

cur.close()
conn.close()
print("\nDone.")
