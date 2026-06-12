#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed narrator supplementary tables from JSON source files."""

import json
import sys
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
DATA_DIR = r"C:\HadithProg\railway\extract\data_named"
BATCH = 500

def connect():
    conn = psycopg2.connect(DB_URL, sslmode='require')
    conn.autocommit = False
    return conn

def load_json(filename):
    path = DATA_DIR + "\\" + filename
    print(f"Loading {filename}...")
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    print(f"  {len(data)} rows")
    return data

def insert_batches(cur, sql, rows, batch_size=BATCH):
    total = len(rows)
    for i in range(0, total, batch_size):
        batch = rows[i:i+batch_size]
        execute_values(cur, sql, batch)
    return total

def seed_narrator_grading(conn):
    print("\n=== narrator_grading ===")
    data = load_json("NounsGarh.json")
    rows = [(r["ID"], r["Text"], r["Sort"], bool(r["IsTaqreeb"])) for r in data]
    sql = """
        INSERT INTO narrator_grading (id, text, sort, is_taqreeb)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Inserted up to {n} rows into narrator_grading")

def seed_narrator_books(conn):
    print("\n=== narrator_books ===")
    data = load_json("NounsBooks.json")
    rows = [(r["RawyID"], r["BookID"]) for r in data]
    sql = """
        INSERT INTO narrator_books (narrator_id, book_id)
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Inserted up to {n} rows into narrator_books")

def seed_narrator_relation_types(conn):
    print("\n=== narrator_relation_types ===")
    data = load_json("NounsRelationsTypes.json")
    rows = [(r["ID"], r["Text"]) for r in data]
    sql = """
        INSERT INTO narrator_relation_types (id, text)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Inserted up to {n} rows into narrator_relation_types")

def seed_narrator_relations(conn):
    print("\n=== narrator_relations ===")
    data = load_json("NounsRelations.json")
    # Filter out rows where SecondRawyID=0
    filtered = [r for r in data if r["SecondRawyID"] != 0]
    print(f"  After filtering SecondRawyID=0: {len(filtered)} rows (was {len(data)})")
    rows = [
        (r["FirstRawyID"], r["SecondRawyID"], r["RelationType"], bool(r["IsShiekh"]))
        for r in filtered
    ]
    sql = """
        INSERT INTO narrator_relations (first_id, second_id, relation_type, is_sheikh)
        VALUES %s
        ON CONFLICT DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Inserted up to {n} rows into narrator_relations")

def verify(conn):
    print("\n=== Verification ===")
    tables = ["narrator_grading", "narrator_books", "narrator_relation_types", "narrator_relations"]
    with conn.cursor() as cur:
        for table in tables:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            count = cur.fetchone()[0]
            print(f"  {table}: {count:,} rows")

def main():
    print("Connecting to Railway PostgreSQL...")
    conn = connect()
    print("Connected.")
    try:
        seed_narrator_grading(conn)
        seed_narrator_books(conn)
        seed_narrator_relation_types(conn)
        seed_narrator_relations(conn)
        verify(conn)
    except Exception as e:
        conn.rollback()
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()
    print("\nDone!")

if __name__ == "__main__":
    main()
