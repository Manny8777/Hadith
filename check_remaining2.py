import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# hadith_shawahed
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hadith_shawahed' ORDER BY ordinal_position")
print("hadith_shawahed cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM hadith_shawahed")
print("hadith_shawahed count:", cur.fetchone()[0])
cur.execute("SELECT * FROM hadith_shawahed LIMIT 3")
for r in cur.fetchall():
    print("  shawahed:", r)

# hadith_index_categories
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hadith_index_categories' ORDER BY ordinal_position")
print("hadith_index_categories cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM hadith_index_categories")
print("hadith_index_categories count:", cur.fetchone()[0])
cur.execute("SELECT * FROM hadith_index_categories LIMIT 5")
for r in cur.fetchall():
    print("  idx_cat:", r)

# hadith_index_items
cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='hadith_index_items' ORDER BY ordinal_position")
print("hadith_index_items cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM hadith_index_items")
print("hadith_index_items count:", cur.fetchone()[0])
cur.execute("SELECT * FROM hadith_index_items LIMIT 5")
for r in cur.fetchall():
    print("  idx_item:", r)

# Check existing index pages
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_name LIKE '%index%' ORDER BY table_name")
print("index tables:", [r[0] for r in cur.fetchall()])

conn.close()
