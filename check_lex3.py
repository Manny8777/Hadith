import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Get a level-2 item (word, not letter) and its details
cur.execute("""
SELECT li.id, li.text, li.parent_id, li.is_leaf, li.results_count, parent.text as parent_text
FROM lexicon_items li
JOIN lexicon_items parent ON parent.id=li.parent_id
WHERE li.lexicon_id=1 AND li.is_leaf=false AND parent.parent_id=1
AND li.results_count > 0
LIMIT 5
""")
for r in cur.fetchall():
    print("word:", r)

# Check what results_count=0 vs >0 means
cur.execute("SELECT COUNT(*) FROM lexicon_items WHERE lexicon_id=1 AND is_leaf=false AND results_count > 0")
print("words with results_count > 0:", cur.fetchone()[0])

# Get a word with hadith links
cur.execute("""
SELECT li.id, li.text, COUNT(lh.hadith_id) as hadith_cnt
FROM lexicon_items li
JOIN lexicon_hadith lh ON lh.lexicon_item_id=li.id
WHERE li.lexicon_id=1 AND li.is_leaf=false
GROUP BY li.id, li.text
ORDER BY hadith_cnt DESC
LIMIT 5
""")
for r in cur.fetchall():
    print("word with hadiths:", r)

# Look at a sample word entry (level 2) in detail
cur.execute("""
SELECT li.id, li.text, li.parent_id, li.is_leaf, li.results_count
FROM lexicon_items li
WHERE li.id=456
""")
word = cur.fetchone()
print("word 456:", word)

cur.execute("SELECT id, text, is_leaf, results_count FROM lexicon_items WHERE parent_id=456 LIMIT 10")
for r in cur.fetchall():
    print("  child:", r)

cur.execute("""
SELECT h.main_id, h.tarf, b.title FROM lexicon_hadith lh
JOIN hadith_toc h ON h.main_id=lh.hadith_id
JOIN books b ON b.id=h.book_id
WHERE lh.lexicon_item_id IN (SELECT id FROM lexicon_items WHERE parent_id=456 OR id=456)
LIMIT 5
""")
for r in cur.fetchall():
    print("  hadith:", r[:2], r[2][:20])

conn.close()