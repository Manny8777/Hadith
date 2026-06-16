import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# List all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
tables = [r[0] for r in cur.fetchall()]
print("tables:", tables)

# Check ghareeb IDs against hadith_services
cur.execute("SELECT hadith_id FROM hadith_services WHERE hadith_id IN (6,7,8,9,11) LIMIT 5")
print("hadith_services:", cur.fetchall())

# What does hadith_services.hadith_id range look like?
cur.execute("SELECT MIN(hadith_id), MAX(hadith_id), COUNT(*) FROM hadith_services")
print("hadith_services range:", cur.fetchone())

conn.close()
