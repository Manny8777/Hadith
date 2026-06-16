import psycopg2, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
DB = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
conn = psycopg2.connect(DB, sslmode="require")
cur = conn.cursor()

# Check tables that don't have pages yet
tables_to_check = [
    'hadith_controversial_tree', 'hadith_controversial_descriptions',
    'lexicon_categories', 'lexicon_items', 'lexicon_hadith',
    'hadith_shawahed',
    'amthal', 'gwamh', 'gwamh_items',
    'matn_comparison',
    'hadith_index_categories', 'hadith_index_items',
]

for t in tables_to_check:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    n = cur.fetchone()[0]
    print(f"{t}: {n}")

# Check lexicon structure
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='lexicon_categories' ORDER BY ordinal_position")
print("lexicon_categories cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM lexicon_categories LIMIT 3")
for r in cur.fetchall():
    print("lex_cat:", r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='lexicon_items' ORDER BY ordinal_position")
print("lexicon_items cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM lexicon_items LIMIT 3")
for r in cur.fetchall():
    print("lex_item:", r)

cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='lexicon_hadith' ORDER BY ordinal_position")
print("lexicon_hadith cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM lexicon_hadith LIMIT 3")
for r in cur.fetchall():
    print("lex_hadith:", r)

# Controversial tree
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='hadith_controversial_tree' ORDER BY ordinal_position")
print("controversial_tree cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM hadith_controversial_tree LIMIT 3")
for r in cur.fetchall():
    print("controversial:", r)

# amthal
cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='amthal' ORDER BY ordinal_position")
print("amthal cols:", [r[0] for r in cur.fetchall()])
cur.execute("SELECT * FROM amthal LIMIT 3")
for r in cur.fetchall():
    print("amthal:", r)

conn.close()
