import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# What service_main_id values are in judgment_links?
cur.execute("SELECT MIN(service_main_id), MAX(service_main_id), COUNT(*) FROM hadith_judgment_links WHERE is_book_toc=false")
print("judgment_links service_main_id range:", cur.fetchone())

# What's the range in hadith_service_content?
cur.execute("SELECT MIN(id), MAX(id), COUNT(*) FROM hadith_service_content")
print("hadith_service_content id range:", cur.fetchone())

# Sample from judgment_links
cur.execute("SELECT service_main_id FROM hadith_judgment_links WHERE is_book_toc=false LIMIT 5")
print("sample jl service_main_ids:", [r[0] for r in cur.fetchall()])

# Sample from quran_ayat_services
cur.execute("SELECT service_main_id FROM quran_ayat_services LIMIT 5")
print("sample quran service_main_ids:", [r[0] for r in cur.fetchall()])

# Check if there's a HadithExpressionsHits or similar table linking hadiths to quran
cur.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE '%quran%'
""")
print("quran tables:", [r[0] for r in cur.fetchall()])

# Look at QuranAyatKerat data - is it the qiraat records per reader per aya?
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'quran_ayat_qiraat'
""")
print("quran_ayat_qiraat columns:", [r[0] for r in cur.fetchall()])

# Check hadith_services tafsser flag - that links a hadith to tafseer service
# Service content for hadith with tafsser=true should appear in Tafsir books
cur.execute("""
    SELECT hjl.service_main_id, hsc.book_id, b.title
    FROM hadith_services hs
    JOIN hadith_judgment_hits hjh ON hjh.hadith_id = hs.hadith_id
    JOIN hadith_judgment_links hjl ON hjl.say_id = hjh.say_id AND hjl.is_book_toc = false
    JOIN hadith_service_content hsc ON hsc.id = hjl.service_main_id
    JOIN books b ON b.id = hsc.book_id
    WHERE hs.tafsser = true
    LIMIT 5
""")
print("tafseer service content for hadiths:", cur.fetchall())

conn.close()
print("Done.")
