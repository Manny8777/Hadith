import psycopg2
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM quran_ayat_services")
print("quran_ayat_services total:", cur.fetchone()[0])

cur.execute("SELECT service_main_id, sura, aya FROM quran_ayat_services LIMIT 5")
print("sample rows:", cur.fetchall())

cur.execute("SELECT service_main_id FROM quran_ayat_services WHERE service_main_id > 0 LIMIT 3")
print("sample service_main_ids:", cur.fetchall())

# Check what service_main_id links to
cur.execute("""
    SELECT q.service_main_id, q.sura, q.aya, h.main_id
    FROM quran_ayat_services q
    JOIN hadith_toc h ON h.main_id = q.service_main_id
    LIMIT 5
""")
print("joined with hadith_toc:", cur.fetchall())

# Check narrators name forms
cur.execute("SELECT COUNT(*) FROM narrator_name_forms")
print("narrator_name_forms total:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM isnad_hadiths WHERE sanad_tahdeth_id IS NOT NULL")
print("isnad_hadiths with sanad_tahdeth_id:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM hadith_services WHERE countries=true")
print("hadith_services countries=true:", cur.fetchone()[0])

conn.close()
print("Done.")
