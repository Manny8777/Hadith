import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import psycopg2
conn = psycopg2.connect(
    'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway',
    sslmode='require'
)
cur = conn.cursor()
cur.execute("SELECT id, text, parent_id, is_leaf FROM lexicon_items WHERE lexicon_id=3 ORDER BY left_value LIMIT 20")
for r in cur.fetchall():
    print(r[0], r[1], r[2], r[3])
conn.close()
