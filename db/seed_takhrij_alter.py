import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv
import json
import time
import psycopg2
import psycopg2.extras
from pathlib import Path

DB = dbenv.url()

DATA_FILE = Path(r'C:\HadithProg\railway\extract\data_named\HTakhreeg.json')

ALTER_STATEMENTS = [
    "ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS pivot_rawy TEXT;",
    "ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS pivot_id INTEGER;",
    "ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS sand_rawy TEXT;",
    "ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS matn_length INTEGER;",
    "ALTER TABLE takhrij ADD COLUMN IF NOT EXISTS is_story BOOLEAN;",
]

BATCH_SIZE = 1000

def main():
    t0 = time.time()

    print("Reading HTakhreeg.json ...")
    with open(DATA_FILE, encoding='utf-8') as f:
        records = json.load(f)
    print(f"Loaded {len(records):,} records in {time.time()-t0:.1f}s")

    print("Connecting to database ...")
    conn = psycopg2.connect(DB, sslmode='require', connect_timeout=30)
    cur = conn.cursor()

    print("Running ALTER TABLE statements ...")
    for stmt in ALTER_STATEMENTS:
        cur.execute(stmt)
    conn.commit()
    print("ALTER TABLE done.")

    total = len(records)
    updated = 0

    print(f"Updating {total:,} rows in batches of {BATCH_SIZE} ...")
    for batch_start in range(0, total, BATCH_SIZE):
        batch = records[batch_start:batch_start + BATCH_SIZE]
        values = []
        for r in batch:
            hadith_id   = r.get('HadithMainID')
            pivot_rawy  = r.get('PivotRawy')
            pivot_id    = r.get('PivotID')
            sand_rawy   = r.get('SandRawy')
            matn_length = r.get('MatnLength')
            is_story    = bool(r.get('IsStory', 0))
            values.append((hadith_id, pivot_rawy, pivot_id, sand_rawy, matn_length, is_story))

        sql = """
            UPDATE takhrij
            SET
                pivot_rawy  = v.pivot_rawy,
                pivot_id    = v.pivot_id,
                sand_rawy   = v.sand_rawy,
                matn_length = v.matn_length,
                is_story    = v.is_story
            FROM (VALUES %s) AS v(hadith_id, pivot_rawy, pivot_id, sand_rawy, matn_length, is_story)
            WHERE takhrij.hadith_id = v.hadith_id::integer
        """
        psycopg2.extras.execute_values(cur, sql, values, template=None, page_size=BATCH_SIZE)
        conn.commit()
        updated += len(batch)

        if updated % 50000 == 0 or updated == total:
            elapsed = time.time() - t0
            print(f"  {updated:,} / {total:,} rows processed ({elapsed:.1f}s)")

    cur.close()
    conn.close()
    elapsed = time.time() - t0
    print(f"\nDone. {updated:,} rows updated in {elapsed:.1f}s")

if __name__ == '__main__':
    main()
