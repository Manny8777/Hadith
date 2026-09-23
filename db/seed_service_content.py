"""
Seed hadith_service_content from BookTOC_Services.json (1.05 GB, 597,197 records)
Using line-by-line streaming to avoid loading 1GB into memory.
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv
import json, sys, time
import psycopg2
from psycopg2.extras import execute_values

DB_URL = dbenv.url()
FILE = r"C:\HadithProg\railway\extract\data\BookTOC_Services.json"
BATCH = 1000

def run():
    conn = psycopg2.connect(DB_URL, sslmode='require')
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM hadith_service_content")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"Already seeded: {existing:,} rows. Skipping.")
        conn.close()
        return

    batch = []
    inserted = 0
    errors = 0
    start = time.time()

    print(f"Streaming {FILE} ...")
    with open(FILE, 'r', encoding='utf-8') as f:
        for lineno, line in enumerate(f, 1):
            line = line.strip()
            if not line or line in ('[', ']'):
                continue
            line = line.rstrip(',')
            try:
                r = json.loads(line)
            except json.JSONDecodeError:
                errors += 1
                continue

            section = (r.get('f13') or '').strip() or None
            part_txt = (r.get('f14') or '').strip() or None

            batch.append((
                r.get('f0'),
                r.get('f1'),
                (r.get('f2') or '').strip() or None,
                r.get('f3'),
                r.get('f5'),
                bool(r.get('f6', False)),
                bool(r.get('f7', False)),
                r.get('f8'),
                r.get('f9'),
                r.get('f11'),
                r.get('f12'),
                section,
                part_txt,
                r.get('f15'),
                r.get('f16'),
                (r.get('f17') or '').strip() or None,
                r.get('f4'),
            ))

            if len(batch) >= BATCH:
                try:
                    execute_values(cur, """
                        INSERT INTO hadith_service_content
                        (id, book_id, book_name, local_node_id, parent_id,
                         is_leaf, is_paragraph, next_id, prev_id,
                         left_value, right_value, section_text, part_text,
                         part_num, page_num, tarf, content)
                        VALUES %s ON CONFLICT DO NOTHING
                    """, batch)
                    conn.commit()
                    inserted += len(batch)
                except Exception as e:
                    conn.rollback()
                    print(f"  Batch error at line {lineno}: {e}")
                    errors += len(batch)
                batch = []

                elapsed = time.time() - start
                rate = inserted / elapsed if elapsed > 0 else 0
                print(f"  {inserted:,} rows | {rate:.0f}/s | ~{lineno:,} lines", end='\r')

    # flush remaining
    if batch:
        try:
            execute_values(cur, """
                INSERT INTO hadith_service_content
                (id, book_id, book_name, local_node_id, parent_id,
                 is_leaf, is_paragraph, next_id, prev_id,
                 left_value, right_value, section_text, part_text,
                 part_num, page_num, tarf, content)
                VALUES %s ON CONFLICT DO NOTHING
            """, batch)
            conn.commit()
            inserted += len(batch)
        except Exception as e:
            conn.rollback()
            print(f"\nFinal batch error: {e}")

    elapsed = time.time() - start
    print(f"\nDone. {inserted:,} rows in {elapsed:.1f}s ({errors} errors)")

    print("Adding GIN index on tarf (may take 1-2 min)...")
    cur.execute("""
        CREATE INDEX IF NOT EXISTS idx_hsc_tarf_gin
        ON hadith_service_content USING gin(
            to_tsvector('simple', normalize_hadith(coalesce(tarf, '')))
        )
        WHERE is_paragraph = true
    """)
    conn.commit()
    print("Index created.")
    conn.close()

if __name__ == '__main__':
    run()
