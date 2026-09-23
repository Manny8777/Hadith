#!/usr/bin/env python3
"""
Seed hadith_index_categories and hadith_index_items tables
from Index.json and IndexItem.json
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv

import json
import psycopg2
from psycopg2.extras import execute_values

DB_URL = dbenv.url()

INDEX_JSON = r"C:\HadithProg\railway\extract\data_named\Index.json"
INDEX_ITEM_JSON = r"C:\HadithProg\railway\extract\data_named\IndexItem.json"


def create_tables(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS hadith_index_categories (
                id          INTEGER PRIMARY KEY,
                title       TEXT,
                parent_id   INTEGER,
                is_leaf     BOOLEAN,
                left_value  INTEGER,
                right_value INTEGER,
                tag         TEXT,
                attribute   TEXT,
                value       TEXT
            );
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS hadith_index_items (
                id       INTEGER PRIMARY KEY,
                title    TEXT,
                index_id INTEGER
            );
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_index_items_index
                ON hadith_index_items(index_id);
        """)
        cur.execute("""
            CREATE INDEX IF NOT EXISTS idx_index_items_title
                ON hadith_index_items
                USING gin(to_tsvector('simple', coalesce(title, '')));
        """)
    conn.commit()
    print("Tables and indexes created (or already exist).")


def seed_index_categories(conn):
    with open(INDEX_JSON, "r", encoding="utf-8") as f:
        rows = json.load(f)

    records = [
        (
            r["ID"],
            r.get("Title") or None,
            r.get("ParentID") or None,
            bool(r.get("IsLeaf")),
            r.get("LeftValue") or None,
            r.get("RightValue") or None,
            r.get("Tag") or None,
            r.get("Attribute") or None,
            r.get("Value") or None,
        )
        for r in rows
    ]

    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE hadith_index_categories RESTART IDENTITY CASCADE;")
        execute_values(
            cur,
            """
            INSERT INTO hadith_index_categories
                (id, title, parent_id, is_leaf, left_value, right_value, tag, attribute, value)
            VALUES %s
            ON CONFLICT (id) DO NOTHING
            """,
            records,
        )
    conn.commit()
    print(f"hadith_index_categories: inserted {len(records)} rows.")
    return len(records)


def seed_index_items(conn):
    print("Loading IndexItem.json (may take a moment)...")
    with open(INDEX_ITEM_JSON, "r", encoding="utf-8") as f:
        rows = json.load(f)

    print(f"  Loaded {len(rows)} rows from IndexItem.json")

    records = [
        (
            r["ID"],
            r.get("Title") or None,
            r.get("IndexID") or None,
        )
        for r in rows
    ]

    batch_size = 5000
    total_inserted = 0

    with conn.cursor() as cur:
        cur.execute("TRUNCATE TABLE hadith_index_items RESTART IDENTITY CASCADE;")
        conn.commit()

        for i in range(0, len(records), batch_size):
            batch = records[i : i + batch_size]
            execute_values(
                cur,
                """
                INSERT INTO hadith_index_items (id, title, index_id)
                VALUES %s
                ON CONFLICT (id) DO NOTHING
                """,
                batch,
            )
            conn.commit()
            total_inserted += len(batch)
            print(f"  Inserted batch {i // batch_size + 1}: {total_inserted}/{len(records)}")

    print(f"hadith_index_items: inserted {total_inserted} rows total.")
    return total_inserted


def report_distribution(conn):
    print("\n--- index_id distribution (hadith_index_items) ---")
    with conn.cursor() as cur:
        cur.execute("""
            SELECT index_id, COUNT(*) AS cnt
            FROM hadith_index_items
            GROUP BY index_id
            ORDER BY index_id;
        """)
        rows = cur.fetchall()
    for index_id, cnt in rows:
        print(f"  index_id={index_id}: {cnt} items")
    return rows


def main():
    print(f"Connecting to DB...")
    conn = psycopg2.connect(DB_URL)
    print("Connected.")

    create_tables(conn)

    cat_count = seed_index_categories(conn)
    item_count = seed_index_items(conn)

    dist = report_distribution(conn)

    conn.close()

    print("\n=== SUMMARY ===")
    print(f"hadith_index_categories rows inserted: {cat_count}")
    print(f"hadith_index_items rows inserted:      {item_count}")
    print(f"Distribution: {dist}")


if __name__ == "__main__":
    main()
