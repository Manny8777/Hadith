import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check all tables in DB to find index-related ones
cur.execute("""
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
AND table_name LIKE '%index%'
ORDER BY table_name
""")
print("index tables:", [r[0] for r in cur.fetchall()])

# Check hadith_index_items more - does it link to hadiths?
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_index_items\' ORDER BY ordinal_position")
print("hadith_index_items cols:", [r[0] for r in cur.fetchall()])

# Check if there's a hadith_index_hits or similar
cur.execute("""
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
AND (table_name LIKE '%hadith_index%' OR table_name LIKE '%index_hit%')
ORDER BY table_name
""")
print("index-related tables:", [r[0] for r in cur.fetchall()])

# matn_comparison
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'matn_comparison\' ORDER BY ordinal_position")
print("matn_comparison cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM matn_comparison LIMIT 5")
for r in cur.fetchall():
    print("  matn_comp:", r)

# hadith_expressions
cur.execute("""
SELECT table_name FROM information_schema.tables 
WHERE table_schema='public' 
AND table_name LIKE '%expression%'
ORDER BY table_name
""")
print("expressions tables:", [r[0] for r in cur.fetchall()])

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_expressions_tree\' ORDER BY ordinal_position")
print("hadith_expressions_tree cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_expressions_tree LIMIT 5")
for r in cur.fetchall():
    print("  expr_tree:", r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name=\'hadith_expressions_hits\' ORDER BY ordinal_position")
print("hadith_expressions_hits cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_expressions_hits LIMIT 5")
for r in cur.fetchall():
    print("  expr_hits:", r)

conn.close()