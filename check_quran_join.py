import psycopg2
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check hadith_service_content columns
cur.execute("""
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_name = 'hadith_service_content'
    ORDER BY ordinal_position
""")
print("hadith_service_content columns:", cur.fetchall())

# Check sample rows
cur.execute("SELECT id, hadith_id, book_id, book_name FROM hadith_service_content LIMIT 5")
print("sample hsc:", cur.fetchall())

# Now try the join: quran_ayat_services -> hadith_service_content -> hadith_toc
cur.execute("""
    SELECT q.service_main_id, q.sura, q.aya, hsc.hadith_id
    FROM quran_ayat_services q
    JOIN hadith_service_content hsc ON hsc.id = q.service_main_id
    LIMIT 5
""")
print("quran->hsc->hadith_id:", cur.fetchall())

# Check what QuranAyatDescrp looks like - the raw source
# Also check if there's a direct field linking to main hadith
cur.execute("""
    SELECT q.service_main_id, q.sura, q.aya, hsc.hadith_id, ht.main_id
    FROM quran_ayat_services q
    JOIN hadith_service_content hsc ON hsc.id = q.service_main_id
    JOIN hadith_toc ht ON ht.main_id = hsc.hadith_id
    LIMIT 5
""")
print("full join:", cur.fetchall())

# Verify for a specific hadith that has tafsser
cur.execute("""
    SELECT ht.main_id, ht.tarf, q.sura, q.aya
    FROM hadith_services hs
    JOIN hadith_toc ht ON ht.main_id = hs.hadith_id
    JOIN hadith_service_content hsc ON hsc.hadith_id = hs.hadith_id
    JOIN quran_ayat_services q ON q.service_main_id = hsc.id
    WHERE hs.tafsser = true
    LIMIT 3
""")
print("hadiths with quran refs:", cur.fetchall())

conn.close()
