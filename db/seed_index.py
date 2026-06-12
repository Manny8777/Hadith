"""
seed_index.py — seeds subject categories and items into Railway PostgreSQL
from Subject.json and SubjectHit.json extracted by extractor.exe.

Usage: python3 db/seed_index.py
"""
import sys, json, time
import ijson
import psycopg2
import psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data_named")
DB   = 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway'
BATCH = 500

conn = psycopg2.connect(DB, connect_timeout=30, sslmode='require')
conn.autocommit = False
cur = conn.cursor()


def ev(sql, data):
    if not data:
        return
    psycopg2.extras.execute_values(cur, sql, data, page_size=BATCH)


def progress(label):
    print(f"\n  {label}:", end="", flush=True)


def ok(n):
    print(f" {n} rows OK", flush=True)


# ─── Step 1: subject_categories from Subject.json ───────────────────────────
progress("subject_categories (Subject.json)")

subject_file = DATA / "Subject.json"
if not subject_file.exists():
    print(f"\nERROR: {subject_file} not found. Run extractor.exe first.", file=sys.stderr)
    sys.exit(1)

with open(subject_file, "r", encoding="utf-8") as f:
    subjects = json.load(f)

rows = []
for r in subjects:
    rows.append((
        r["ID"],
        r.get("SubjectTitle") or r.get("Title"),
        r.get("ParentID"),
        bool(r.get("IsLeaf", False)),
        r.get("LeftValue"),
        r.get("RightValue"),
        r.get("NodeID"),
        bool(r.get("IsColored", False)),
    ))

ev("""INSERT INTO subject_categories (id, title, parent_id, is_leaf, left_value, right_value, node_id, is_colored)
    VALUES %s ON CONFLICT (id) DO NOTHING""", rows)
conn.commit()
ok(len(rows))

# Also seed subject_items from same Subject.json — same structure, it IS the items table
# The Subject table is both the hierarchy AND the leaf items
# For browsing we split: parent nodes go into subject_categories, leaves into subject_items
# But SubjectHit.SubjectID references Subject.ID which are ALL nodes (not just leaves)
# So we seed ALL Subject rows into subject_items too (they are the "topics")
progress("subject_items (from Subject.json — all nodes as browsable topics)")

rows = []
for r in subjects:
    rows.append((
        r["ID"],
        r.get("SubjectTitle") or r.get("Title"),
        r.get("ParentID"),
        bool(r.get("IsLeaf", False)),
        r.get("LeftValue"),
        r.get("RightValue"),
        r.get("NodeID"),
        bool(r.get("IsColored", False)),
    ))

ev("""INSERT INTO subject_items (id, title, parent_id, is_leaf, left_value, right_value, node_id, is_colored)
    VALUES %s ON CONFLICT (id) DO NOTHING""", rows)
conn.commit()
ok(len(rows))

# ─── Step 2: hadith_subjects from SubjectHit.json (streaming — large file) ──
progress("hadith_subjects (SubjectHit.json — streaming)")

subjecthit_file = DATA / "SubjectHit.json"
if not subjecthit_file.exists():
    print(f"\nERROR: {subjecthit_file} not found. Run extractor.exe first.", file=sys.stderr)
    sys.exit(1)

# Load valid subject IDs to avoid FK violations
valid_subject_ids = set(r["ID"] for r in subjects)
print(f" (loaded {len(valid_subject_ids)} valid subject IDs)", end="", flush=True)

batch = []
count = 0
skipped = 0
t0 = time.time()


def flush_batch():
    ev("""INSERT INTO hadith_subjects (id, subject_id, paragraph_main_id, node_id)
        VALUES %s ON CONFLICT (id) DO NOTHING""", batch)
    conn.commit()


with open(subjecthit_file, "rb") as f:
    for row in ijson.items(f, "item"):
        sid = row.get("SubjectID")
        pid = row.get("ParagraphMainID")
        rid = row.get("ID")
        nid = row.get("NodeID")

        if sid not in valid_subject_ids:
            skipped += 1
            continue
        if pid is None or rid is None:
            skipped += 1
            continue

        batch.append((rid, sid, pid, nid))
        count += 1

        if len(batch) >= BATCH:
            flush_batch()
            batch = []
            if count % 50000 == 0:
                elapsed = time.time() - t0
                print(f" {count//1000}k ({elapsed:.0f}s)", end="", flush=True)

if batch:
    flush_batch()

ok(count)
print(f"  Skipped {skipped} rows (FK violations or missing data)")

# ─── Final counts ────────────────────────────────────────────────────────────
print("\n── Final row counts ──")
for table in ("subject_categories", "subject_items", "hadith_subjects"):
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    n = cur.fetchone()[0]
    print(f"  {table}: {n:,} rows")

cur.close()
conn.close()
print(f"\nDone in {time.time()-t0:.0f}s")
