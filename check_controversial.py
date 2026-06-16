import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Get top 3 levels of controversial tree
cur.execute("""
SELECT ct.id, ct.text, ct.parent_id, ct.is_leaf, ct.node_id, ct.is_colored,
       ct.left_value, ct.right_value,
       COUNT(cd.service_main_id)::int as desc_count
FROM hadith_controversial_tree ct
LEFT JOIN hadith_controversial_descriptions cd ON cd.node_id = ct.node_id
WHERE ct.parent_id > 0
GROUP BY ct.id, ct.text, ct.parent_id, ct.is_leaf, ct.node_id, ct.is_colored,
         ct.left_value, ct.right_value
ORDER BY ct.left_value
LIMIT 30
""")
for r in cur.fetchall():
    print("controversial:", r)

# Check what service_main_id links to
cur.execute("SELECT id, book_name, section_text, part_text FROM hadith_service_content WHERE id=297846")
r = cur.fetchone()
if r:
    print("service 297846:", r)

# Total leaf nodes
cur.execute("SELECT COUNT(*) FROM hadith_controversial_tree WHERE is_leaf=true")
print("leaf count:", cur.fetchone()[0])

# Count top-level categories
cur.execute("SELECT id, text, (right_value-left_value-1)/2 as children FROM hadith_controversial_tree WHERE parent_id=1 ORDER BY left_value")
for r in cur.fetchall():
    print("  top cat:", r)

conn.close()