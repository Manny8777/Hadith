import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='amthal' ORDER BY ordinal_position")
print("amthal cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM amthal")
print("amthal count:", cur.fetchone()[0])
cur.execute("SELECT * FROM amthal LIMIT 5")
for r in cur.fetchall():
    print("amthal:", r)

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='gwamh' ORDER BY ordinal_position")
print("gwamh cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM gwamh")
print("gwamh count:", cur.fetchone()[0])
cur.execute("SELECT * FROM gwamh LIMIT 5")
for r in cur.fetchall():
    print("gwamh:", r)

cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='gwamh_items' ORDER BY ordinal_position")
print("gwamh_items cols:", cur.fetchall())
cur.execute("SELECT COUNT(*) FROM gwamh_items")
print("gwamh_items count:", cur.fetchone()[0])
cur.execute("SELECT * FROM gwamh_items LIMIT 5")
for r in cur.fetchall():
    print("gwamh_items:", r)

# Check if amthal links to hadiths
cur.execute("""
    SELECT column_name FROM information_schema.columns
    WHERE table_name='amthal' ORDER BY ordinal_position
""")
print("Done")
conn.close()
