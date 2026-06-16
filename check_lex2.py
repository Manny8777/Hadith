import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check lexicon_hadith columns
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'lexicon_hadith\' ORDER BY ordinal_position")
print("lexicon_hadith cols:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT * FROM lexicon_hadith LIMIT 5")
for r in cur.fetchall():
    print("lh:", r)

# Check if hadith links are on leaf or non-leaf items
cur.execute("SELECT li.is_leaf, COUNT(*) FROM lexicon_hadith lh JOIN lexicon_items li ON li.id=lh.lexicon_item_id GROUP BY li.is_leaf")
for r in cur.fetchall():
    print("is_leaf, count:", r)

# Get a sample word item (non-leaf) and its children
cur.execute("SELECT id, text, parent_id, is_leaf, results_count FROM lexicon_items WHERE lexicon_id=1 AND is_leaf=false LIMIT 3")
samples = cur.fetchall()
for s in samples:
    print("word:", s)
    cur.execute("SELECT id, text, is_leaf FROM lexicon_items WHERE parent_id=%s LIMIT 5", (s[0],))
    children = cur.fetchall()
    print("  children:", children)
    cur.execute("SELECT h.main_id, h.tarf, b.title FROM lexicon_hadith lh JOIN hadith_toc h ON h.main_id=lh.hadith_id JOIN books b ON b.id=h.book_id WHERE lh.lexicon_item_id=%s LIMIT 3", (s[0],))
    hadiths = cur.fetchall()
    print("  hadiths:", hadiths)

conn.close()