import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# id=833345 basic info
cur.execute("""
SELECT id, book_id, book_name, parent_id, section_text, part_text, is_leaf, is_paragraph, part_num, page_num
FROM hadith_service_content WHERE id = 833345
""")
print("id=833345:", cur.fetchone())

# quran_ayat_services
cur.execute("SELECT * FROM quran_ayat_services WHERE service_main_id = 833345")
print("quran_ayat_services:", cur.fetchone())

# service_text cols and sample
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_service_text' ORDER BY ordinal_position")
print("service_text cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT service_main_id, hadith_id, say_id FROM hadith_service_text WHERE service_main_id = 833345 LIMIT 3")
for r in cur.fetchall():
    print("service_text:", r)

# Parent chain for 833345
cur.execute("""
WITH RECURSIVE ancestors AS (
  SELECT id, parent_id, section_text, part_text, book_id, book_name
  FROM hadith_service_content WHERE id = 833345
  UNION ALL
  SELECT h.id, h.parent_id, h.section_text, h.part_text, h.book_id, h.book_name
  FROM hadith_service_content h
  JOIN ancestors a ON h.id = a.parent_id
  WHERE a.parent_id != 0
)
SELECT id, parent_id, section_text, part_text FROM ancestors
""")
for r in cur.fetchall():
    print("ancestor:", r)

# Count children
cur.execute("SELECT COUNT(*) FROM hadith_service_content WHERE parent_id = 833345")
print("children count:", cur.fetchone()[0])

# First few children
cur.execute("SELECT id, section_text, part_text, is_leaf, part_num, page_num FROM hadith_service_content WHERE parent_id = 833345 LIMIT 5")
for r in cur.fetchall():
    print("child:", r)

conn.close()
