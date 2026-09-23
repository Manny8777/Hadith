import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv
import json
import time
import psycopg2
import psycopg2.extras
from pathlib import Path

DB = dbenv.url()
DATA_DIR = Path(r'C:\HadithProg\railway\extract\data_named')
SCHEMA_FILE = Path(r'C:\HadithProg\railway\db\schema_content_tables.sql')
BATCH_SIZE = 1000


def connect():
    return psycopg2.connect(DB, sslmode='require', connect_timeout=30)


def apply_schema(conn):
    print("Applying schema ...")
    sql = SCHEMA_FILE.read_text(encoding='utf-8')
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()
    print("Schema applied.")


def seed_amthal(conn):
    print("\n--- Seeding amthal (Amthal.json) ---")
    t0 = time.time()
    with open(DATA_DIR / 'Amthal.json', encoding='utf-8') as f:
        records = json.load(f)
    print(f"Loaded {len(records):,} records")

    rows = [(r['ID'], r['Text']) for r in records]
    sql = "INSERT INTO amthal (id, text) VALUES %s ON CONFLICT DO NOTHING"
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i:i + BATCH_SIZE], page_size=BATCH_SIZE)
            conn.commit()
            print(f"  {min(i + BATCH_SIZE, len(rows)):,} / {len(rows):,} rows inserted")
    print(f"amthal done in {time.time()-t0:.1f}s")


def seed_gwamh(conn):
    print("\n--- Seeding gwamh (Gwamh.json) ---")
    t0 = time.time()
    with open(DATA_DIR / 'Gwamh.json', encoding='utf-8') as f:
        records = json.load(f)
    print(f"Loaded {len(records):,} records")

    rows = [(r['ID'], r['Name']) for r in records]
    sql = "INSERT INTO gwamh (id, name) VALUES %s ON CONFLICT DO NOTHING"
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i:i + BATCH_SIZE], page_size=BATCH_SIZE)
            conn.commit()
            print(f"  {min(i + BATCH_SIZE, len(rows)):,} / {len(rows):,} rows inserted")
    print(f"gwamh done in {time.time()-t0:.1f}s")


def seed_gwamh_items(conn):
    print("\n--- Seeding gwamh_items (GwamhItems.json) ---")
    t0 = time.time()
    with open(DATA_DIR / 'GwamhItems.json', encoding='utf-8') as f:
        records = json.load(f)
    print(f"Loaded {len(records):,} records")

    rows = [(r['GamhID'], r['ID'], r.get('Text')) for r in records]
    sql = "INSERT INTO gwamh_items (gamh_id, id, text) VALUES %s ON CONFLICT DO NOTHING"
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i:i + BATCH_SIZE], page_size=BATCH_SIZE)
            conn.commit()
            done = min(i + BATCH_SIZE, len(rows))
            if done % 10000 == 0 or done == len(rows):
                print(f"  {done:,} / {len(rows):,} rows inserted")
    print(f"gwamh_items done in {time.time()-t0:.1f}s")


def seed_matn_dates(conn):
    print("\n--- Seeding matn_dates (MatnDates.json) ---")
    t0 = time.time()
    with open(DATA_DIR / 'MatnDates.json', encoding='utf-8') as f:
        records = json.load(f)
    print(f"Loaded {len(records):,} records")

    rows = [(r['ID'], r['Text']) for r in records]
    sql = "INSERT INTO matn_dates (id, text) VALUES %s ON CONFLICT DO NOTHING"
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i:i + BATCH_SIZE], page_size=BATCH_SIZE)
            conn.commit()
            print(f"  {min(i + BATCH_SIZE, len(rows)):,} / {len(rows):,} rows inserted")
    print(f"matn_dates done in {time.time()-t0:.1f}s")


def report_counts(conn):
    print("\n--- Row counts ---")
    tables = ['amthal', 'gwamh', 'gwamh_items', 'matn_dates']
    with conn.cursor() as cur:
        for t in tables:
            cur.execute(f"SELECT COUNT(*) FROM {t}")
            count = cur.fetchone()[0]
            print(f"  {t}: {count:,} rows")


def main():
    t_total = time.time()
    print("Connecting to database ...")
    conn = connect()
    print("Connected.")

    apply_schema(conn)
    seed_amthal(conn)
    seed_gwamh(conn)
    seed_gwamh_items(conn)
    seed_matn_dates(conn)
    report_counts(conn)

    conn.close()
    print(f"\nAll done in {time.time()-t_total:.1f}s")


if __name__ == '__main__':
    main()
