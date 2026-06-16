import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Find hadiths that are ghareeb (sample IDs)
cur.execute("SELECT hadith_main_id FROM hadith_ghareeb LIMIT 5")
ids = [r[0] for r in cur.fetchall()]
print("ghareeb hadith_main_ids:", ids)

# Check if these exist in hadiths table by id or by local_id or by another column
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadiths' ORDER BY ordinal_position")
print("hadith cols:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT id, hadith_no, book_id FROM hadiths WHERE id IN %s", (tuple(ids),))
print("hadiths by id:", cur.fetchall())

# What about hadith_services.hadith_id?
cur.execute("SELECT hadith_id FROM hadith_services WHERE hadith_id IN %s LIMIT 5", (tuple(ids),))
print("hadith_services by hadith_id:", cur.fetchall())

# Count ghareeb hadiths that match our hadiths table
cur.execute("""
SELECT COUNT(*) FROM hadith_ghareeb g
JOIN hadiths h ON h.id = g.hadith_main_id
""")
print("ghareeb that match hadiths.id:", cur.fetchone()[0])

# group_matn: what's group_id and book_id?
cur.execute("SELECT hadith_main_id, group_id, book_id FROM hadith_group_matn LIMIT 5")
for r in cur.fetchall():
    print("group_matn:", r)

# Check if group hadiths exist in our table
cur.execute("""
SELECT g.group_id, COUNT(*) as cnt
FROM hadith_group_matn g
JOIN hadiths h ON h.id = g.hadith_main_id
GROUP BY g.group_id
ORDER BY cnt DESC
LIMIT 5
""")
print("top groups:")
for r in cur.fetchall():
    print(r)

conn.close()
