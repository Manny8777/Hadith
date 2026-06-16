"""
seed_quran_tables.py
Seeds the complete Quran system from data/ JSON files:
1. quran_suras        (QuranSoar.json — 114 rows)
2. quran_ayat         (QuranAyat.json — 6,236 rows)
3. quran_ayat_services (QuranAyatDescrp.json)
4. quran_ayat_qiraat  (QuranAyatKerat.json — 5,031 rows)
5. quran_readers      (QuranReaders.json — ~30 rows)
6. quran_readers_ayat (QuranReadersAyat.json — ~423 rows)

Fields (from Catalog.xml):
  QuranSoar:     ID, Name, HasTafsser, HasQera
  QuranAyat:     ID, SoraID, AyaNum, Text, HasTafsser, HasQera, KeratText
  QuranAyatDescrp: ID, ServiceMainID, Sura, Aya
  QuranAyatKerat: AyaID, ServiceMainID
  QuranReaders:  ID, ReaderName, ParentID, IsLeaf, LeftValue, RightValue, NodeID, IsColored
  QuranReadersAyat: ReaderID, AyaID
"""

import json, time, sys
import psycopg2, psycopg2.extras
from pathlib import Path

DATA_NAMED = Path(r"C:\HadithProg\railway\extract\data_named")
DATA_RAW   = Path(r"C:\HadithProg\railway\extract\data")

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
BATCH = 1000

conn = psycopg2.connect(DB, sslmode="require", connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()


def ev(sql, rows):
    psycopg2.extras.execute_values(cur, sql, rows, page_size=BATCH)


def load(name):
    for base in [DATA_NAMED, DATA_RAW]:
        p = base / f"{name}.json"
        if p.exists():
            print(f"  Loading {p} ...", flush=True)
            with open(p, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError(f"{name}.json not found in data_named/ or data/")


def is_named(rows, key):
    return rows and key in rows[0]


# ── 1. quran_suras ────────────────────────────────────────────────────────────
print("\n[1/6] quran_suras (QuranSoar) ...", flush=True)
t0 = time.time()
rows = load("QuranSoar")
named = is_named(rows, "ID")
data = [(
    r["ID"] if named else r["f0"],
    r.get("Name")  if named else r.get("f1"),
    bool(r.get("HasTafsser", False) if named else r.get("f2", False)),
    bool(r.get("HasQera", False)    if named else r.get("f3", False)),
) for r in rows]
ev("INSERT INTO quran_suras (id, name, has_tafsser, has_qera) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 2. quran_ayat ─────────────────────────────────────────────────────────────
print("\n[2/6] quran_ayat (QuranAyat) ...", flush=True)
t0 = time.time()
rows = load("QuranAyat")
named = is_named(rows, "ID")
data = [(
    r["ID"]     if named else r["f0"],
    r.get("SoraID")  if named else r.get("f1"),
    r.get("AyaNum")  if named else r.get("f2"),
    r.get("Text")    if named else r.get("f3"),
    bool(r.get("HasTafsser", False) if named else r.get("f4", False)),
    bool(r.get("HasQera", False)    if named else r.get("f5", False)),
    r.get("KeratText") if named else r.get("f6"),
) for r in rows]
ev("INSERT INTO quran_ayat (id, sora_id, aya_num, text, has_tafsser, has_qera, kerat_text) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 3. quran_ayat_services ────────────────────────────────────────────────────
print("\n[3/6] quran_ayat_services (QuranAyatDescrp) ...", flush=True)
t0 = time.time()
rows = load("QuranAyatDescrp")
named = is_named(rows, "ID")
data = [(
    r["ID"]              if named else r["f0"],
    r.get("ServiceMainID") if named else r.get("f1"),
    r.get("Sura")        if named else r.get("f2"),
    r.get("Aya")         if named else r.get("f3"),
) for r in rows]
ev("INSERT INTO quran_ayat_services (id, service_main_id, sura, aya) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 4. quran_ayat_qiraat ──────────────────────────────────────────────────────
print("\n[4/6] quran_ayat_qiraat (QuranAyatKerat) ...", flush=True)
t0 = time.time()
rows = load("QuranAyatKerat")
named = is_named(rows, "AyaID")
data = [(
    r["AyaID"]           if named else r["f0"],
    r.get("ServiceMainID") if named else r.get("f1"),
) for r in rows]
ev("INSERT INTO quran_ayat_qiraat (aya_id, service_main_id) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 5. quran_readers ──────────────────────────────────────────────────────────
print("\n[5/6] quran_readers (QuranReaders) ...", flush=True)
t0 = time.time()
rows = load("QuranReaders")
named = is_named(rows, "ID")
data = [(
    r["ID"]              if named else r["f0"],
    r.get("ReaderName")  if named else r.get("f1"),
    r.get("ParentID")    if named else r.get("f2"),
    bool(r.get("IsLeaf", False) if named else r.get("f3", False)),
    r.get("LeftValue")   if named else r.get("f4"),
    r.get("RightValue")  if named else r.get("f5"),
    r.get("NodeID")      if named else r.get("f6"),
    bool(r.get("IsColored", False) if named else r.get("f7", False)),
) for r in rows]
ev("INSERT INTO quran_readers (id, reader_name, parent_id, is_leaf, left_value, right_value, node_id, is_colored) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── 6. quran_readers_ayat ─────────────────────────────────────────────────────
print("\n[6/6] quran_readers_ayat (QuranReadersAyat) ...", flush=True)
t0 = time.time()
rows = load("QuranReadersAyat")
named = is_named(rows, "ReaderID")
data = [(
    r["ReaderID"] if named else r["f0"],
    r.get("AyaID") if named else r.get("f1"),
) for r in rows]
ev("INSERT INTO quran_readers_ayat (reader_id, aya_id) VALUES %s ON CONFLICT DO NOTHING", data)
conn.commit()
print(f"  {len(data):,} rows inserted in {time.time()-t0:.1f}s")


# ── Summary ──────────────────────────────────────────────────────────────────
print("\n── Row counts ──")
for tbl in ["quran_suras","quran_ayat","quran_ayat_services","quran_ayat_qiraat","quran_readers","quran_readers_ayat"]:
    cur.execute(f"SELECT COUNT(*) FROM {tbl}")
    print(f"  {tbl}: {cur.fetchone()[0]:,}")

cur.close()
conn.close()
print("\nDone.")
