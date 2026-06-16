import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check narrator_name_forms sample
cur.execute("SELECT * FROM narrator_name_forms LIMIT 5")
cols = [d[0] for d in cur.description]
print("narrator_name_forms columns:", cols)
print("sample:", cur.fetchall())

# Check narrator_teachers sample
cur.execute("SELECT * FROM narrator_teachers LIMIT 3")
cols = [d[0] for d in cur.description]
print("narrator_teachers columns:", cols)
print("sample:", cur.fetchall())

# Check narrator_grading_links sample
cur.execute("SELECT * FROM narrator_grading_links LIMIT 3")
cols = [d[0] for d in cur.description]
print("narrator_grading_links columns:", cols)
print("sample:", cur.fetchall())

# Check what narrator id=1 has
cur.execute("SELECT id, name FROM narrators WHERE id=1")
print("narrator 1:", cur.fetchone())

cur.execute("SELECT * FROM narrator_name_forms WHERE narrator_id=1 LIMIT 5")
print("name_forms for id=1:", cur.fetchall())

# Find a narrator with name forms
cur.execute("SELECT narrator_id, COUNT(*) FROM narrator_name_forms GROUP BY narrator_id ORDER BY COUNT(*) DESC LIMIT 3")
print("top narrators with name forms:", cur.fetchall())

conn.close()
print("Done.")
