import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("""
    SELECT id, book_id, parent_id, is_leaf, is_paragraph,
           left_value, right_value
    FROM hadith_service_content
    WHERE id = 833329
""")
print("node 833329:", cur.fetchone())

cur.execute("""
    SELECT id, is_paragraph, is_leaf, left_value, right_value
    FROM hadith_service_content
    WHERE parent_id = 833329
    LIMIT 5
""")
print("children:", cur.fetchall())

cur.execute("""
    SELECT hjl.say_id, hjl.service_main_id, hjh.hadith_id
    FROM hadith_service_content root
    JOIN hadith_service_content child ON child.left_value >= root.left_value
         AND child.right_value <= root.right_value
         AND child.book_id = root.book_id
    JOIN hadith_judgment_links hjl ON hjl.service_main_id = child.id
    JOIN hadith_judgment_hits hjh ON hjh.say_id = hjl.say_id
    WHERE root.id = 833329
    LIMIT 5
""")
print("hadiths via judgment nested set:", cur.fetchall())

# Alternative: check what the quran_ayat_services main_id IS in the content tree
cur.execute("""
    SELECT q.service_main_id, hsc.book_id, hsc.left_value, hsc.right_value,
           COUNT(child.id) as child_count
    FROM quran_ayat_services q
    JOIN hadith_service_content hsc ON hsc.id = q.service_main_id
    LEFT JOIN hadith_service_content child ON child.left_value > hsc.left_value
         AND child.right_value < hsc.right_value AND child.book_id = hsc.book_id
    WHERE q.sura = 2 AND q.aya = 255
    GROUP BY q.service_main_id, hsc.book_id, hsc.left_value, hsc.right_value
""")
print("aya 2:255 (Ayat al-Kursi) node:", cur.fetchone())

conn.close()
print("Done.")
