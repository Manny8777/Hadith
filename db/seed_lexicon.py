"""
seed_lexicon.py — seeds lexicon tables from JSON data files
Usage: python3 seed_lexicon.py
"""
import json
import sys
import psycopg2
import psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data_named")
DB   = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
BATCH = 500

conn = psycopg2.connect(DB, connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, data):
    if not data:
        return
    psycopg2.extras.execute_values(cur, sql, data, page_size=BATCH)


def load(name):
    with open(DATA / f"{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def ok(n):
    print(f" {n} rows", flush=True)


# ─── 1. lexicon_categories ────────────────────────────────────────────
print("lexicon_categories:", end="", flush=True)
rows = load("Lexicon")
ev("""INSERT INTO lexicon_categories (id, name) VALUES %s ON CONFLICT DO NOTHING""",
   [(r["ID"], r["Name"]) for r in rows])
conn.commit()
ok(len(rows))

# ─── 2. lexicon_items ─────────────────────────────────────────────────
print("lexicon_items:", end="", flush=True)
rows = load("LexiconItems")
batch = []
count = 0
for r in rows:
    batch.append((
        r["ID"],
        r["LexiconID"],
        r.get("Text"),
        r.get("ParentID"),
        r.get("LeftValue"),
        r.get("RightValue"),
        bool(r.get("IsLeaf", 0)),
        r.get("ResultsCount", 0),
    ))
    if len(batch) >= BATCH:
        ev("""INSERT INTO lexicon_items
              (id, lexicon_id, text, parent_id, left_value, right_value, is_leaf, results_count)
              VALUES %s ON CONFLICT DO NOTHING""", batch)
        conn.commit()
        count += len(batch)
        batch = []

if batch:
    ev("""INSERT INTO lexicon_items
          (id, lexicon_id, text, parent_id, left_value, right_value, is_leaf, results_count)
          VALUES %s ON CONFLICT DO NOTHING""", batch)
    conn.commit()
    count += len(batch)

ok(count)

# ─── 3. Collect valid item IDs for FK check ──────────────────────────
print("  collecting valid lexicon_item IDs...", flush=True)
cur.execute("SELECT id FROM lexicon_items")
valid_ids = {row[0] for row in cur.fetchall()}
print(f"  {len(valid_ids)} valid item IDs", flush=True)

# ─── 4. lexicon_hadith ────────────────────────────────────────────────
print("lexicon_hadith:", end="", flush=True)
rows = load("LexiconDescrp")
batch = []
count = 0
skipped = 0
for r in rows:
    item_id = r["LexiconItemID"]
    hadith_id = r["DescrpMainID"]
    if item_id not in valid_ids:
        skipped += 1
        continue
    batch.append((item_id, hadith_id))
    if len(batch) >= BATCH:
        try:
            ev("""INSERT INTO lexicon_hadith (lexicon_item_id, hadith_id)
                  VALUES %s ON CONFLICT DO NOTHING""", batch)
            conn.commit()
        except Exception as e:
            conn.rollback()
            # skip bad rows individually
            for item in batch:
                try:
                    cur.execute(
                        "INSERT INTO lexicon_hadith (lexicon_item_id, hadith_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        item
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()
                    skipped += 1
        count += len(batch)
        batch = []

if batch:
    try:
        ev("""INSERT INTO lexicon_hadith (lexicon_item_id, hadith_id)
              VALUES %s ON CONFLICT DO NOTHING""", batch)
        conn.commit()
    except Exception as e:
        conn.rollback()
        for item in batch:
            try:
                cur.execute(
                    "INSERT INTO lexicon_hadith (lexicon_item_id, hadith_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                    item
                )
                conn.commit()
            except Exception:
                conn.rollback()
                skipped += 1
    count += len(batch)

ok(count)
print(f"  skipped (FK violation or no match): {skipped}", flush=True)

# ─── Verify ───────────────────────────────────────────────────────────
print("\nVerification:")
for table in ["lexicon_categories", "lexicon_items", "lexicon_hadith"]:
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    print(f"  {table}: {cur.fetchone()[0]:,} rows")

cur.close()
conn.close()
print("\nDone.")
