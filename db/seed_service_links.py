"""
Seed hadith_service_links from HadithsServices.json (919,929 rows)
Links hadiths to their commentary entries in hadith_service_content.
"""
import json, sys, time
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
FILE = r"C:\HadithProg\railway\extract\data_named\HadithsServices.json"
BATCH = 2000

def run():
    conn = psycopg2.connect(DB_URL, sslmode='require')
    cur = conn.cursor()

    cur.execute("SELECT COUNT(*) FROM hadith_service_links")
    existing = cur.fetchone()[0]
    if existing > 0:
        print(f"Already seeded: {existing:,} rows. Skipping.")
        conn.close()
        return

    print(f"Reading {FILE} ...")
    with open(FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)

    total = len(data)
    print(f"Loaded {total:,} records. Inserting...")

    start = time.time()
    inserted = 0
    for i in range(0, total, BATCH):
        chunk = data[i:i+BATCH]
        rows = [(
            r['HadithMainID'],
            r['ServiceMainID'],
            r.get('TypeID'),
            r.get('Reserve'),
        ) for r in chunk if r.get('HadithMainID') and r.get('ServiceMainID')]

        try:
            execute_values(cur, """
                INSERT INTO hadith_service_links
                (hadith_id, service_content_id, type_id, reserve)
                VALUES %s ON CONFLICT DO NOTHING
            """, rows)
            conn.commit()
            inserted += len(rows)
        except Exception as e:
            conn.rollback()
            print(f"\nBatch error at offset {i}: {e}")

        elapsed = time.time() - start
        rate = inserted / elapsed if elapsed > 0 else 0
        print(f"  {inserted:,}/{total:,} | {rate:.0f}/s", end='\r')

    elapsed = time.time() - start
    print(f"\nDone. {inserted:,} rows in {elapsed:.1f}s")
    conn.close()

if __name__ == '__main__':
    run()
