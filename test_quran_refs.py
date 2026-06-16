import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Test the new nested-set quran-refs query for a few hadiths
test_hadiths = [1543, 1, 100, 500, 1000, 5000]
for hid in test_hadiths:
    cur.execute("""
        SELECT DISTINCT q.sura, q.aya
        FROM hadith_judgment_hits hjh
        JOIN hadith_judgment_links hjl ON hjl.say_id = hjh.say_id AND hjl.is_book_toc = false
        JOIN hadith_service_content jlc ON jlc.id = hjl.service_main_id
        JOIN hadith_service_content anc
          ON anc.book_id = jlc.book_id
          AND anc.left_value <= jlc.left_value
          AND anc.right_value >= jlc.right_value
        JOIN quran_ayat_services q ON q.service_main_id = anc.id
        WHERE hjh.hadith_id = %s
        LIMIT 5
    """, [hid])
    rows = cur.fetchall()
    print(f"hadith {hid}: {rows}")

# Check what book_ids appear in both tables
cur.execute("""
    SELECT DISTINCT jlc.book_id
    FROM hadith_judgment_links hjl
    JOIN hadith_service_content jlc ON jlc.id = hjl.service_main_id
    WHERE hjl.is_book_toc = false
    LIMIT 10
""")
jl_books = [r[0] for r in cur.fetchall()]
print(f"book_ids in judgment_links: {jl_books}")

cur.execute("""
    SELECT DISTINCT hsc.book_id
    FROM quran_ayat_services q
    JOIN hadith_service_content hsc ON hsc.id = q.service_main_id
    LIMIT 10
""")
qs_books = [r[0] for r in cur.fetchall()]
print(f"book_ids in quran_ayat_services: {qs_books}")

print(f"overlap: {set(jl_books) & set(qs_books)}")

conn.close()
print("Done.")
