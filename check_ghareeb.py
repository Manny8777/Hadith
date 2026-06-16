import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# ghareeb structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_ghareeb' ORDER BY ordinal_position")
print("ghareeb cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_ghareeb LIMIT 3")
for r in cur.fetchall():
    print("ghareeb:", r)

# group_matn structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_group_matn' ORDER BY ordinal_position")
print("group_matn cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_group_matn LIMIT 3")
for r in cur.fetchall():
    print("group_matn:", r)

# Check ghareeb for hadith 1543 (Bukhari example)
cur.execute("SELECT * FROM hadith_ghareeb WHERE hadith_id = 1543 LIMIT 5")
for r in cur.fetchall():
    print("ghareeb for 1543:", r)

# Check ghareeb for first 10 hadith IDs
cur.execute("SELECT DISTINCT hadith_id FROM hadith_ghareeb LIMIT 5")
for r in cur.fetchall():
    print("ghareeb hadith_ids:", r[0])

conn.close()
