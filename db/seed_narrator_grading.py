#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Seed narrator_grading_terms and narrator_scientists tables from JSON source files."""

import json
import sys
import os
import psycopg2
from psycopg2.extras import execute_values

DB_URL = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
DATA_DIR = r"C:\HadithProg\railway\extract\data_named"
SCHEMA_FILE = r"C:\HadithProg\railway\db\schema_narrator_grading.sql"
BATCH = 1000

def connect():
    conn = psycopg2.connect(DB_URL, sslmode='require')
    conn.autocommit = False
    return conn

def load_json(filename):
    path = os.path.join(DATA_DIR, filename)
    print(f"Loading {filename}...")
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    print(f"  {len(data):,} rows loaded")
    return data

def insert_batches(cur, sql, rows, batch_size=BATCH):
    total = len(rows)
    inserted = 0
    for i in range(0, total, batch_size):
        batch = rows[i:i+batch_size]
        execute_values(cur, sql, batch)
        inserted += len(batch)
        if inserted % 10000 == 0 or inserted == total:
            print(f"  ...{inserted:,} / {total:,} rows processed")
    return total

def apply_schema(conn):
    print("\n=== Applying schema ===")
    with open(SCHEMA_FILE, encoding='utf-8') as f:
        schema_sql = f.read()
    with conn.cursor() as cur:
        cur.execute(schema_sql)
    conn.commit()
    print("  Schema applied.")

def seed_narrator_grading_terms(conn):
    print("\n=== narrator_grading_terms (NounsGarh.json) ===")
    data = load_json("NounsGarh.json")
    rows = [
        (
            r["ID"],
            r["Text"],        # Arabic jarh/ta'dil phrase
            r["Sort"],
            bool(r["IsTaqreeb"])
        )
        for r in data
    ]
    sql = """
        INSERT INTO narrator_grading_terms (id, term_text, sort_order, is_taqreeb)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Done: {n:,} rows processed into narrator_grading_terms")

def seed_narrator_scientists(conn):
    print("\n=== narrator_scientists (NounsScientists.json) ===")
    data = load_json("NounsScientists.json")
    rows = [
        (
            r["ID"],
            r["ScientistID"],
            r["RelaterID"] if r["RelaterID"] != 0 else None,
            r["ScientistName"] if r["ScientistName"] else None,
            r["RelaterName"] if r["RelaterName"] else None
        )
        for r in data
    ]
    sql = """
        INSERT INTO narrator_scientists (id, scientist_id, relater_id, scientist_name, relater_name)
        VALUES %s
        ON CONFLICT (id) DO NOTHING
    """
    with conn.cursor() as cur:
        n = insert_batches(cur, sql, rows)
    conn.commit()
    print(f"  Done: {n:,} rows processed into narrator_scientists")

def verify(conn):
    print("\n=== Verification (row counts) ===")
    tables = ["narrator_grading_terms", "narrator_scientists"]
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
        apply_schema(conn)
        seed_narrator_grading_terms(conn)
        seed_narrator_scientists(conn)
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
