"""
seed.py — loads extracted JSON into Railway PostgreSQL
Usage: DATABASE_URL="$DATABASE_URL" python3 seed.py

Uses streaming JSON for large tables (BookTOC_Hadith, etc.)
"""
import os, sys, json, time
import ijson
import psycopg2
import psycopg2.extras
from pathlib import Path

DATA = Path(r"C:\HadithProg\railway\extract\data_named")
DB   = os.environ.get("DATABASE_URL")
if not DB:
    sys.exit("ERROR: DATABASE_URL not set")

conn = psycopg2.connect(DB, connect_timeout=30)
conn.autocommit = False
cur = conn.cursor()
BATCH = 500


def ev(sql, data):
    psycopg2.extras.execute_values(cur, sql, data, page_size=BATCH)


def load(name):
    with open(DATA / f"{name}.json", "r", encoding="utf-8") as f:
        return json.load(f)


def stream(name):
    with open(DATA / f"{name}.json", "rb") as f:
        yield from ijson.items(f, "item")


def progress(label):
    print(f"\n  {label}:", end="", flush=True)


def ok(n):
    print(f" {n} rows", flush=True)


# ─── Books ───────────────────────────────────────────────────────────
progress("books")
rows = load("Book")
ev("""INSERT INTO books (id,title,summary,author_id,strong,fame,tarteeb,
       takhrij_author,takhrij_death,card_info,print1_edition)
    VALUES %s ON CONFLICT DO NOTHING""", [
    (r["ID"], r.get("Title"), r.get("Summary"), r.get("AuthorID"),
     r.get("Strong",0), r.get("Fame",0), r.get("Tarteeb",0),
     r.get("TakhreejAuthor"), r.get("TakhreejAuthorDeathDate"),
     r.get("CardInformation"), r.get("Print1Edition"))
    for r in rows
])
conn.commit()
ok(len(rows))

# ─── Authors ─────────────────────────────────────────────────────────
progress("authors")
rows = load("Authors")
ev("""INSERT INTO authors (id,name,short_name,death_date,info)
    VALUES %s ON CONFLICT DO NOTHING""", [
    (r["ID"], r.get("Name"), r.get("ShortName"), r.get("DeathDate"), r.get("Information"))
    for r in rows
])
conn.commit()
ok(len(rows))

# ─── Narrators ───────────────────────────────────────────────────────
progress("narrators")
rows = load("Nouns")
ev("""INSERT INTO narrators (id,name,abb_name,kunia,death_year,death_year_num,
       birth_year,death_city,birth_city,tabaqa,tabaqa_num,hadiths_count,
       martaba_ibn_hajar,martaba_zahabi)
    VALUES %s ON CONFLICT DO NOTHING""", [
    (r["ID"], r.get("Name"), r.get("AbbName"), r.get("Kunia"),
     r.get("DeathYear"), r.get("DeathYearNum",0), r.get("BirthYear"),
     r.get("DeathCity"), r.get("BirthCity"), r.get("Tabaqa"),
     r.get("TabaqaNum",0), r.get("HadithsCount",0),
     r.get("MartabaIbnHajar"), r.get("MartabaZahabi"))
    for r in rows
])
conn.commit()
ok(len(rows))

# ─── Isnad chains (Asaned) ───────────────────────────────────────────
progress("isnad_chains")
rows = load("Asaned")
ev("""INSERT INTO isnad_chains (id,narrator_ids,types,hadiths_count)
    VALUES %s ON CONFLICT DO NOTHING""", [
    (r["ID"], r.get("SandRwah","").strip(), r.get("SandTypes","").strip(),
     r.get("HadithsCount",0))
    for r in rows
])
conn.commit()
ok(len(rows))

# ─── Isnad ↔ Hadith links (AsanedHadiths) ────────────────────────────
progress("isnad_hadiths")
rows = load("AsanedHadiths")
ev("""INSERT INTO isnad_hadiths (hadith_id,book_id,isnad_id,isnad_type)
    VALUES %s ON CONFLICT DO NOTHING""", [
    (r["HadithMainID"], r.get("BookID"), r["SanadID"], r.get("SanadType",1))
    for r in rows
])
conn.commit()
ok(len(rows))

# ─── Hadith judgments ────────────────────────────────────────────────
progress("hadith_judgments")
try:
    hits = load("HadithJudgmentHits")
    says = {r["ID"]: r for r in load("HadithJudgmentSays")}
    ev("""INSERT INTO hadith_judgments (hadith_id,scientist_id,say_text)
        VALUES %s""", [
        (h["HadithMainID"], says.get(h["SayID"],{}).get("ScientistID"),
         says.get(h["SayID"],{}).get("Say"))
        for h in hits
    ])
    conn.commit()
    ok(len(hits))
except Exception as e:
    conn.rollback()
    print(f" SKIP ({e})", flush=True)

# ─── Hadith TOC (streaming — ~340K rows, ~1GB JSON) ──────────────────
progress("hadith_toc (streaming)")
batch, count, t0 = [], 0, time.time()


def flush():
    ev("""INSERT INTO hadith_toc (
        main_id,book_id,book_name,id,content,parent_id,
        is_leaf,is_paragraph,paragraph_id,next_paragraph_id,prev_paragraph_id,
        left_value,right_value,section_text,chapter_text,
        part_num,page_num,tarf,tarqeem_harf,tarqeem_matboa1,mosanef_id
    ) VALUES %s ON CONFLICT DO NOTHING""", [(
        r["MainID"], r["BookID"], r.get("BookName"), r.get("ID"),
        r.get("Content"), r.get("ParentID"),
        bool(r.get("IsLeaf")), bool(r.get("IsParagraph")),
        r.get("ParagraphID"), r.get("NextParagraphID"), r.get("PrevParagraphID"),
        r.get("LeftValue"), r.get("RightValue"),
        r.get("SectionText","").strip() or None,
        r.get("ChapterText","").strip() or None,
        r.get("PartNum") or 0, r.get("PageNum") or 0,
        r.get("Tarf","").strip() or None,
        r.get("TarqeemHarf","").strip() or None,
        r.get("TarqeemMatboa1","").strip() or None,
        r.get("MosanefID") or 0
    ) for r in batch])
    conn.commit()


for row in stream("BookTOC_Hadith"):
    batch.append(row)
    count += 1
    if len(batch) >= BATCH:
        flush()
        batch = []
        if count % 10000 == 0:
            elapsed = time.time() - t0
            print(f" {count//1000}k ({elapsed:.0f}s)", end="", flush=True)

if batch:
    flush()

ok(count)
cur.close()
conn.close()
print(f"\nDone in {time.time()-t0:.0f}s")
