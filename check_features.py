import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# hadith_index_categories
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_index_categories\' ORDER BY ordinal_position")
print("hadith_index_categories cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_index_categories LIMIT 9")
for r in cur.fetchall():
    print("  cat:", r)

# hadith_index_items
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_index_items\' ORDER BY ordinal_position")
print("hadith_index_items cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_index_items LIMIT 5")
for r in cur.fetchall():
    print("  item:", r)
cur.execute("SELECT COUNT(*) FROM hadith_index_items")
print("hadith_index_items count:", cur.fetchone()[0])

# controversial
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_controversial_tree\' ORDER BY ordinal_position")
print("controversial_tree cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_controversial_tree LIMIT 5")
for r in cur.fetchall():
    print("  controversial_tree:", r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_controversial_descriptions\' ORDER BY ordinal_position")
print("controversial_desc cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_controversial_descriptions LIMIT 3")
for r in cur.fetchall():
    print("  controversial_desc:", r)

conn.close()