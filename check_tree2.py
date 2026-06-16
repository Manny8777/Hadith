import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Does quran_ayat_services.service_main_id appear in hadith_judgment_links?
cur.execute("""
    SELECT COUNT(*) FROM hadith_judgment_links hjl
    JOIN quran_ayat_services q ON q.service_main_id = hjl.service_main_id
""")
print("quran service_main_ids found in judgment_links:", cur.fetchone()[0])

# Check book 84 - what is it?
cur.execute("SELECT id, title FROM books WHERE id = 84")
print("book 84:", cur.fetchone())

# What book does 833329 come from and what table does it connect to?
# Let's look at all judgment_links for these nodes
cur.execute("""
    SELECT hjl.service_main_id, hjh.hadith_id
    FROM hadith_judgment_links hjl
    JOIN hadith_judgment_hits hjh ON hjh.say_id = hjl.say_id
    WHERE hjl.service_main_id BETWEEN 833329 AND 833340
    LIMIT 10
""")
print("judgment_links for nodes 833329-840:", cur.fetchall())

# Check QuranAyatDescrp / quran_ayat_services - maybe we need a direct lookup in the original source
# Let's see HadithServicesState instead - maybe it links hadith to quran aya
# Or look at what QuranAyatKerat data looks like
cur.execute("SELECT * FROM quran_ayat_qiraat LIMIT 3")
print("quran_ayat_qiraat sample:", cur.fetchall())

# Check if there's another way: quran_ayat_services might link via a different mechanism
# Let's look at the parent of 833329 in the tree
cur.execute("""
    SELECT id, book_id, parent_id, is_leaf, is_paragraph, left_value, right_value
    FROM hadith_service_content WHERE id = 833328
""")
print("parent of 833329:", cur.fetchone())

# And the parent's parent
cur.execute("""
    SELECT id, book_id, parent_id, is_leaf, is_paragraph, left_value, right_value
    FROM hadith_service_content WHERE id = (
        SELECT parent_id FROM hadith_service_content WHERE id = 833328
    )
""")
print("grandparent:", cur.fetchone())

conn.close()
print("Done.")
