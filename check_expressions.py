import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_expressions_tree' ORDER BY ordinal_position")
print("expressions_tree cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_expressions_tree LIMIT 5")
print("tree sample:", cur.fetchall())

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_expressions_hits' ORDER BY ordinal_position")
print("expressions_hits cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT COUNT(*) FROM hadith_expressions_hits")
print("hits count:", cur.fetchone()[0])
cur.execute("SELECT * FROM hadith_expressions_hits LIMIT 3")
print("hits sample:", cur.fetchall())

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_expressions_says' ORDER BY ordinal_position")
print("expressions_says cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_expressions_says LIMIT 3")
print("says sample:", cur.fetchall())

conn.close()
