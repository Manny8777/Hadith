import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# hadith_toc cols
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_toc' ORDER BY ordinal_position")
print("hadith_toc cols:", [r[0] for r in cur.fetchall()])

# Sample hadith_toc
cur.execute("SELECT main_id, tarf, book_id, hadith_no, LEFT(matn,100) FROM hadith_toc LIMIT 3")
for r in cur.fetchall():
    print("hadith_toc:", r)

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

    # Get all members of this group
    cur.execute("""
    SELECT gm.hadith_main_id, gm.book_id, b.title as book_title, ht.tarf, ht.hadith_no
    FROM hadith_group_matn gm
    JOIN books b ON b.id = gm.book_id
    LEFT JOIN hadith_toc ht ON ht.main_id = gm.hadith_main_id
    WHERE gm.group_id = %s
    ORDER BY gm.book_id
    LIMIT 15
    """, [gid])
    for r in cur.fetchall():
        print("group member:", r)

# Count hadiths that have ghareeb flag
cur.execute("""
SELECT COUNT(*) FROM hadith_ghareeb g
JOIN hadith_services hs ON hs.hadith_id = g.hadith_main_id
""")
print("ghareeb with services:", cur.fetchone()[0])

# Check if there's another way to flag ghareeb - via services
cur.execute("SELECT COUNT(*) FROM hadith_services WHERE ghareeb = true")
print("services.ghareeb=true:", cur.fetchone()[0])

# hadith_modrag structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_modrag' ORDER BY ordinal_position")
print("hadith_modrag cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_modrag LIMIT 3")
for r in cur.fetchall():
    print("modrag:", r)

conn.close()
