import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# hadith_expressions_says
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_expressions_says\' ORDER BY ordinal_position")
print("hadith_expressions_says cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_expressions_says LIMIT 5")
for r in cur.fetchall():
    print("  says:", r)
cur.execute("SELECT COUNT(*) FROM hadith_expressions_says")
print("says count:", cur.fetchone()[0])

# Check what hit_id refers to - is it in hadith_service_content or hadith_toc?
cur.execute("SELECT EXISTS(SELECT 1 FROM hadith_service_content WHERE id=832609)")
print("hit_id 832609 in service_content:", cur.fetchone()[0])
cur.execute("SELECT EXISTS(SELECT 1 FROM hadith_toc WHERE main_id=832609)")
print("hit_id 832609 in hadith_toc:", cur.fetchone()[0])

# Get full tree structure
cur.execute("SELECT id, text, parent_id, is_leaf, node_id FROM hadith_expressions_tree ORDER BY left_value LIMIT 30")
for r in cur.fetchall():
    depth = 0
    pid = r[2]
    print("  " * min(pid or 0, 3), f"[{r[0]}] {r[1]} (leaf={r[3]}, node_id={r[4]})")

# For a leaf node, what hits does it have?
cur.execute("SELECT node_id, COUNT(*) as cnt FROM hadith_expressions_hits GROUP BY node_id ORDER BY cnt DESC LIMIT 5")
for r in cur.fetchall():
    print("node hits:", r)

# Check a hit_id in service_content
cur.execute("SELECT id, book_name, section_text, part_text, tarf FROM hadith_service_content WHERE id=832609 LIMIT 1")
r = cur.fetchone()
if r:
    print("service_content 832609:", r[:4], str(r[4])[:50] if r[4] else None)

conn.close()