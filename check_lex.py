import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'lexicon_items\' ORDER BY ordinal_position")
print("lexicon_items cols:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT COUNT(*) FROM lexicon_items WHERE lexicon_id=2")
print("lexicon 2 total:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM lexicon_items WHERE lexicon_id=2 AND is_leaf=false")
print("lexicon 2 non-leaf:", cur.fetchone()[0])

cur.execute("SELECT COUNT(*) FROM lexicon_items WHERE lexicon_id=2 AND is_leaf=true")
print("lexicon 2 leaf:", cur.fetchone()[0])

cur.execute("SELECT id, text, parent_id, is_leaf, left_value, right_value FROM lexicon_items WHERE lexicon_id=2 ORDER BY left_value LIMIT 10")
for r in cur.fetchall():
    print("alam:", r)

cur.execute("SELECT * FROM lexicon_items WHERE lexicon_id=2 LIMIT 1")
row = cur.fetchone()
print("sample row:", row)
print("cols:", [d[0] for d in cur.description])

cur.execute("SELECT COUNT(*) FROM lexicon_hadith lh JOIN lexicon_items li ON li.id=lh.lexicon_item_id WHERE li.lexicon_id=2")
print("alam hadith links:", cur.fetchone()[0])

# Check if there is a content column in lexicon_items
cur.execute("SELECT id, text, parent_id, is_leaf FROM lexicon_items WHERE lexicon_id=1 AND is_leaf=true LIMIT 5")
for r in cur.fetchall():
    print("leaf sample:", r)

conn.close()