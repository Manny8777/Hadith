import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# hadith_service_types
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_service_types' ORDER BY ordinal_position")
print("service_types cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_service_types ORDER BY id")
for r in cur.fetchall():
    print("type:", r)

conn.close()
