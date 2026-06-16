import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check if amthal.id is a hadith_toc.main_id
cur.execute("SELECT a.id, EXISTS(SELECT 1 FROM hadith_toc WHERE main_id=a.id) as in_toc, EXISTS(SELECT 1 FROM hadith_service_content WHERE id=a.id) as in_sc FROM amthal a LIMIT 10")
for r in cur.fetchall():
    print("amthal id check:", r)

# Check hadith_services.amthal column — which hadiths have amthal=true?
cur.execute("SELECT COUNT(*) FROM hadith_services WHERE amthal=true")
print("hadith_services amthal=true:", cur.fetchone()[0])
cur.execute("SELECT hadith_id FROM hadith_services WHERE amthal=true LIMIT 10")
print("sample hadith_ids with amthal:", [r[0] for r in cur.fetchall()])

# Check amthal IDs range
cur.execute("SELECT MIN(id), MAX(id) FROM amthal")
print("amthal id range:", cur.fetchone())

# Check gwamh_items.id - is it narrator IDs?
cur.execute("SELECT gi.id, gi.text, n.name FROM gwamh_items gi LEFT JOIN narrators n ON n.id=gi.id WHERE gi.gamh_id=1 LIMIT 5")
print("gwamh_items joined narrators:")
for r in cur.fetchall():
    print(" ", r)

# Check gwamh_items - are there hadiths linked to these narrators?
cur.execute("""
    SELECT gi.id, gi.text, COUNT(DISTINCT ht.main_id) as hadith_count
    FROM gwamh_items gi
    LEFT JOIN hadith_toc ht ON ht.main_id IN (
        SELECT ih.hadith_id FROM isnad_hadiths ih
        JOIN isnad_chains ic ON ic.id=ih.isnad_id
        WHERE gi.id = ANY(ic.narrator_id_array)
    )
    WHERE gi.gamh_id=1
    GROUP BY gi.id, gi.text
    LIMIT 5
""")
print("gwamh narrator hadiths (slow check skipped)")

conn.close()
