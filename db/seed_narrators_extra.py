#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
seed_narrators_extra.py
Adds missing columns to narrators table (if not present) then bulk-updates
them from Nouns.json.

JSON fields -> DB columns mapping:
  IsNoun       -> is_noun        (boolean)
  IsScientist  -> is_scientist   (boolean)
  IsHasRwaya   -> is_has_rwaya   (boolean)
  IsMobham     -> is_mobham      (boolean)
  JourneyDate  -> journey_date   (text)
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import json
import sys
import time
import psycopg2
import psycopg2.extras

DB_URL = dbenv.url()
JSON_PATH = r"C:\HadithProg\railway\extract\data_named\Nouns.json"
BATCH_SIZE = 1000
PROGRESS_EVERY = 20000

# Map: json_key -> (db_column, pg_cast)
FIELD_MAP = [
    ("IsNoun",      "is_noun",      "boolean"),
    ("IsScientist", "is_scientist", "boolean"),
    ("IsHasRwaya",  "is_has_rwaya", "boolean"),
    ("IsMobham",    "is_mobham",    "boolean"),
    ("JourneyDate", "journey_date", "text"),
]


def get_existing_columns(cur):
    cur.execute("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'narrators'
    """)
    return {row[0] for row in cur.fetchall()}


def ensure_columns(conn, cur, active_fields):
    """Add columns that are missing from the table."""
    existing = get_existing_columns(cur)
    added = []
    for jk, col, pg_type in active_fields:
        if col not in existing:
            print(f"  Adding column: {col} ({pg_type})")
            cur.execute(f"ALTER TABLE narrators ADD COLUMN {col} {pg_type}")
            added.append(col)
    if added:
        conn.commit()
        print(f"  Committed {len(added)} new column(s): {added}")
    else:
        print("  All columns already exist - will update values.")
    return added


def batch_update(conn, cur, rows, db_cols, pg_casts):
    """
    Batch UPDATE using VALUES list.
    rows: list of tuples (id, val1, val2, ...)
    db_cols: list of db column names (same order as tuple[1:])
    pg_casts: list of pg types for each value column
    """
    if not rows:
        return 0

    # SET col1=v.col1, col2=v.col2, ...
    col_assigns = ", ".join(f"{c} = v.{c}" for c in db_cols)
    col_names   = "id, " + ", ".join(db_cols)

    # Type template: (%s::int, %s::boolean, ...)
    all_casts = ["int"] + pg_casts
    template  = "(" + ", ".join(f"%s::{t}" for t in all_casts) + ")"

    sql = f"""
        UPDATE narrators AS n
        SET {col_assigns}
        FROM (VALUES %s) AS v({col_names})
        WHERE n.id = v.id
    """

    psycopg2.extras.execute_values(
        cur, sql, rows, template=template, page_size=BATCH_SIZE
    )
    conn.commit()
    return len(rows)


def main():
    print("=" * 60)
    print("seed_narrators_extra.py")
    print("=" * 60)

    # 1. Load JSON
    print(f"\n[1] Loading {JSON_PATH} ...")
    t0 = time.time()
    with open(JSON_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    print(f"    Loaded {len(data):,} rows in {time.time()-t0:.1f}s")

    # 2. Connect
    print("\n[2] Connecting to database ...")
    conn = psycopg2.connect(DB_URL, sslmode="require")
    cur  = conn.cursor()
    print("    Connected.")

    # 3. Determine which fields actually exist in JSON sample
    sample = data[0] if data else {}
    active_fields = [
        (jk, col, pg_type)
        for jk, col, pg_type in FIELD_MAP
        if jk in sample
    ]
    if not active_fields:
        print("ERROR: None of the expected JSON fields found. Aborting.")
        sys.exit(1)

    print(f"\n[3] Fields found in JSON that will be seeded:")
    for jk, col, pg_type in active_fields:
        print(f"    {jk:20s} -> {col} ({pg_type})")

    # 4. Ensure columns exist in DB
    print("\n[4] Ensuring columns exist in narrators table ...")
    ensure_columns(conn, cur, active_fields)

    # Re-check which columns now exist
    db_columns = get_existing_columns(cur)
    seeded = [(jk, col, pg_type)
              for jk, col, pg_type in active_fields
              if col in db_columns]
    json_keys = [jk       for jk, col, pg_type in seeded]
    db_cols   = [col      for jk, col, pg_type in seeded]
    pg_casts  = [pg_type  for jk, col, pg_type in seeded]

    print(f"\n    Will UPDATE columns: {db_cols}")

    # 5. Build rows and batch update
    print(f"\n[5] Updating narrators table (batch_size={BATCH_SIZE}) ...")
    total_updated = 0
    batch = []
    t_start = time.time()

    for i, rec in enumerate(data):
        row_id = rec.get("ID")
        if row_id is None:
            continue

        vals = tuple([row_id] + [rec.get(jk) for jk in json_keys])
        batch.append(vals)

        if len(batch) >= BATCH_SIZE:
            total_updated += batch_update(conn, cur, batch, db_cols, pg_casts)
            batch = []

        if (i + 1) % PROGRESS_EVERY == 0:
            elapsed = time.time() - t_start
            rate = (i + 1) / max(elapsed, 0.001)
            print(f"    Progress: {i+1:,}/{len(data):,} rows processed "
                  f"({rate:.0f} rows/s, {total_updated:,} updated so far)")

    # Flush remainder
    if batch:
        total_updated += batch_update(conn, cur, batch, db_cols, pg_casts)

    elapsed = time.time() - t_start
    print(f"\n[6] Done.")
    print(f"    Total rows updated : {total_updated:,}")
    print(f"    Fields populated   : {db_cols}")
    print(f"    Time elapsed       : {elapsed:.1f}s")

    # 7. Spot-check
    print("\n[7] Spot-check - first 5 rows from narrators with new fields:")
    select_cols = ", ".join(["id"] + db_cols)
    cur.execute(f"SELECT {select_cols} FROM narrators ORDER BY id LIMIT 5")
    rows = cur.fetchall()
    header = ["id"] + db_cols
    print("    " + " | ".join(f"{h:16s}" for h in header))
    print("    " + "-" * (18 * len(header)))
    for row in rows:
        print("    " + " | ".join(f"{str(v):16s}" for v in row))

    # 8. Count non-null per column
    print("\n[8] Non-null counts per new column:")
    for col in db_cols:
        cur.execute(f"SELECT COUNT(*) FROM narrators WHERE {col} IS NOT NULL")
        cnt = cur.fetchone()[0]
        print(f"    {col}: {cnt:,} non-null rows")

    cur.close()
    conn.close()
    print("\nAll done.")


if __name__ == "__main__":
    main()
