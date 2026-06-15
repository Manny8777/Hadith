#!/usr/bin/env python3
"""
Seed hadith_judgment_hits and hadith_judgment_links tables.
Source files:
  - HadithJudgmentHits.json  : [{SayID, HadithMainID}, ...]
  - HadithJudgmentLinks.json : [{SayID, ServiceMainID, ISBookTocHadith}, ...]
"""

import json
import os
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
DATA_DIR = r"C:\HadithProg\railway\extract\data_named"
SCHEMA_FILE = r"C:\HadithProg\railway\db\schema_judgment_tables.sql"
BATCH = 1000

def get_conn():
    return psycopg2.connect(DB_URL, sslmode="require")

def apply_schema(cur):
    with open(SCHEMA_FILE, "r", encoding="utf-8") as f:
        cur.execute(f.read())
    print("Schema applied.")

def seed_hits(cur):
    path = os.path.join(DATA_DIR, "HadithJudgmentHits.json")
    print(f"Loading {path} ...")
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    print(f"  {len(rows):,} rows read from HadithJudgmentHits.json")

    data = [(r["SayID"], r["HadithMainID"]) for r in rows]
    inserted = 0
    for i in range(0, len(data), BATCH):
        batch = data[i:i + BATCH]
        execute_values(
            cur,
            """
            INSERT INTO hadith_judgment_hits (say_id, hadith_id)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            batch
        )
        inserted += len(batch)
        if inserted % 50000 == 0 or inserted == len(data):
            print(f"  hadith_judgment_hits: {inserted:,}/{len(data):,} processed")

    cur.execute("SELECT COUNT(*) FROM hadith_judgment_hits")
    count = cur.fetchone()[0]
    print(f"  hadith_judgment_hits final row count: {count:,}")

def seed_links(cur):
    path = os.path.join(DATA_DIR, "HadithJudgmentLinks.json")
    print(f"Loading {path} ...")
    with open(path, "r", encoding="utf-8") as f:
        rows = json.load(f)
    print(f"  {len(rows):,} rows read from HadithJudgmentLinks.json")

    data = [(r["SayID"], r["ServiceMainID"], bool(r["ISBookTocHadith"])) for r in rows]
    inserted = 0
    for i in range(0, len(data), BATCH):
        batch = data[i:i + BATCH]
        execute_values(
            cur,
            """
            INSERT INTO hadith_judgment_links (say_id, service_main_id, is_book_toc)
            VALUES %s
            ON CONFLICT DO NOTHING
            """,
            batch
        )
        inserted += len(batch)
        if inserted % 50000 == 0 or inserted == len(data):
            print(f"  hadith_judgment_links: {inserted:,}/{len(data):,} processed")

    cur.execute("SELECT COUNT(*) FROM hadith_judgment_links")
    count = cur.fetchone()[0]
    print(f"  hadith_judgment_links final row count: {count:,}")

def main():
    print("Connecting to database...")
    conn = get_conn()
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            apply_schema(cur)
            conn.commit()

            seed_hits(cur)
            conn.commit()
            print("hadith_judgment_hits committed.")

            seed_links(cur)
            conn.commit()
            print("hadith_judgment_links committed.")

        print("\nDone.")
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
