import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Sample hadith_toc
cur.execute("SELECT main_id, tarf, book_id, book_name FROM hadith_toc LIMIT 3")
for r in cur.fetchall():
    print("hadith_toc:", r[0], r[1][:50] if r[1] else None, r[2], r[3])

# For a hadith with matn_comparison=true, find group members
cur.execute("""
SELECT hadith_id FROM hadith_services WHERE matn_comparison = true LIMIT 1
""")
hid = cur.fetchone()[0]
print("matn_comparison hadith:", hid)

# Get group_id for this hadith
cur.execute("SELECT group_id FROM hadith_group_matn WHERE hadith_main_id = %s LIMIT 1", [hid])
row = cur.fetchone()
if row:
    gid = row[0]
    print("group_id:", gid)
    cur.execute("""
    SELECT gm.hadith_main_id, ht.book_name, ht.tarf
    FROM hadith_group_matn gm
    LEFT JOIN hadith_toc ht ON ht.main_id = gm.hadith_main_id
    WHERE gm.group_id = %s
    LIMIT 8
    """, [gid])
    for r in cur.fetchall():
        print("group member:", r[0], r[1], r[2][:60] if r[2] else None)

# hadith_modrag structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_modrag' ORDER BY ordinal_position")
print("hadith_modrag cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_modrag LIMIT 3")
for r in cur.fetchall():
    print("modrag:", r)

# ghareeb counts
cur.execute("SELECT COUNT(*) FROM hadith_ghareeb")
print("total ghareeb:", cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM hadith_services WHERE ghareeb = true")
print("services.ghareeb=true:", cur.fetchone()[0])

conn.close()
