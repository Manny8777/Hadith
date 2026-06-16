import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check max main_id in hadith_toc
cur.execute("SELECT MIN(main_id), MAX(main_id) FROM hadith_toc")
print("hadith_toc main_id range:", cur.fetchone())

# Check what 759292 is
cur.execute("SELECT main_id, book_name FROM hadith_toc WHERE main_id=759292")
r = cur.fetchone()
print("hadith_toc 759292:", r)

# Check lexicon_hadith for item 5642
cur.execute("SELECT * FROM lexicon_hadith WHERE lexicon_item_id=5642")
for r in cur.fetchall():
    print("lh for 5642:", r)

# Check if those hadith_ids exist in some other table
cur.execute("SELECT COUNT(*) FROM hadith_toc WHERE main_id IN (SELECT hadith_id FROM lexicon_hadith LIMIT 100)")
print("lexicon hadiths in hadith_toc:", cur.fetchone()[0])

# What tables have those IDs?
sample_hids = []
cur.execute("SELECT hadith_id FROM lexicon_hadith LIMIT 10")
for r in cur.fetchall():
    sample_hids.append(r[0])
print("sample hadith_ids:", sample_hids)

# Check if they are service_content IDs
cur.execute("SELECT COUNT(*) FROM hadith_service_content WHERE id IN %s", (tuple(sample_hids),))
print("in service_content:", cur.fetchone()[0])

conn.close()