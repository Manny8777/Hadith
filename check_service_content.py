import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Sample book 84 (Tafsir al-Tabari)
cur.execute("""
SELECT id, book_id, parent_id, section_text, part_text, is_leaf, tarf, content
FROM hadith_service_content
WHERE book_id = 84 LIMIT 3
""")
for r in cur.fetchall():
    print("book84 sample:", r)

# What does id=833345 look like?
cur.execute("""
SELECT id, book_id, book_name, parent_id, section_text, part_text, is_leaf, tarf, LEFT(content,200)
FROM hadith_service_content
WHERE id = 833345
""")
r = cur.fetchone()
print("id=833345:", r)

# quran_ayat_services
cur.execute("SELECT * FROM quran_ayat_services WHERE service_main_id = 833345")
r = cur.fetchone()
print("quran_ayat_services for 833345:", r)

# service_text table
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_service_text' ORDER BY ordinal_position")
print("service_text cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT COUNT(*) FROM hadith_service_text")
print("service_text count:", cur.fetchone()[0])
cur.execute("SELECT * FROM hadith_service_text WHERE service_main_id = 833345 LIMIT 2")
for r in cur.fetchall():
    print("service_text:", r)

# Books
cur.execute("""
SELECT book_id, book_name, COUNT(*) as cnt
FROM hadith_service_content
GROUP BY book_id, book_name
ORDER BY cnt DESC
LIMIT 15
""")
for r in cur.fetchall():
    print("book:", r)

# Children of 833345
cur.execute("""
SELECT id, section_text, part_text, is_leaf, parent_id, LEFT(content, 100)
FROM hadith_service_content
WHERE parent_id = 833345
LIMIT 8
""")
for r in cur.fetchall():
    print("children:", r)

# A sample leaf node with content
cur.execute("""
SELECT id, section_text, part_text, tarf, LEFT(content, 300)
FROM hadith_service_content
WHERE book_id = 84 AND is_leaf = true
LIMIT 3
""")
for r in cur.fetchall():
    print("leaf:", r)

conn.close()
