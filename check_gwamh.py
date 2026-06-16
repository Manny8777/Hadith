import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# gwamh
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'gwamh\' ORDER BY ordinal_position")
print("gwamh cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT COUNT(*) FROM gwamh")
print("gwamh count:", cur.fetchone()[0])
cur.execute("SELECT * FROM gwamh LIMIT 3")
for r in cur.fetchall():
    print("gwamh:", r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'gwamh_items\' ORDER BY ordinal_position")
print("gwamh_items cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT COUNT(*) FROM gwamh_items")
print("gwamh_items count:", cur.fetchone()[0])
cur.execute("SELECT * FROM gwamh_items LIMIT 5")
for r in cur.fetchall():
    print("gwamh_items:", r)

# Check all other unbuilt tables
cur.execute("""
SELECT t.table_name, COUNT(*) as row_count
FROM information_schema.tables t
CROSS JOIN LATERAL (
    SELECT COUNT(*) FROM information_schema.columns WHERE table_name=t.table_name
) c(col_count)
WHERE t.table_schema=\'public\'
AND t.table_name NOT IN (
    \'hadith_toc\', \'books\', \'narrators\', \'takhrij\', \'isnad_chains\', \'isnad_hadiths\',
    \'hadith_judgments\', \'hadith_subjects\', \'subject_items\', \'hadith_services\',
    \'hadith_service_content\', \'lexicon_items\', \'lexicon_hadith\', \'lexicon_categories\',
    \'hadith_group_matn\', \'hadith_ghareeb\', \'hadith_modrag\'
)
ORDER BY t.table_name
LIMIT 30
""")
tables = cur.fetchall()
print("tables:")
for t in tables:
    print(" ", t[0])

conn.close()