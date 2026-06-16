import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

cur.execute("""
    SELECT table_name,
           (SELECT COUNT(*) FROM information_schema.columns WHERE table_name=t.table_name) as col_count
    FROM information_schema.tables t
    WHERE table_schema='public'
    AND table_type='BASE TABLE'
    ORDER BY table_name
""")
tables = cur.fetchall()
print(f"Total tables: {len(tables)}")
for t, cols in tables:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    n = cur.fetchone()[0]
    print(f"  {t} ({cols} cols): {n:,} rows")

conn.close()
