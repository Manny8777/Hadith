"""
seed_matn_comparison.py — creates matn_comparison table and loads pairs
from HMatnComparisonFiltered3.json (per-hadith comparison descriptions)
"""
import os as _os, sys as _sys
_sys.path.insert(0, _os.path.dirname(_os.path.abspath(__file__)))
import dbenv
import json, re, time, psycopg2, psycopg2.extras
from pathlib import Path

DB = dbenv.url()
DATA_FILE = Path(r'C:\HadithProg\railway\extract\data_named\HMatnComparisonFiltered3.json')
SCHEMA_FILE = Path(r'C:\HadithProg\railway\db\schema_matn_comparison.sql')

def normalize(s):
    if not s:
        return s
    s = re.sub(r'\s+', ' ', s).strip()
    return s

print('Loading data ...')
with open(DATA_FILE, encoding='utf-8') as f:
    rows = json.load(f)
print(f'Loaded {len(rows)} pairs')

print('Connecting ...')
conn = psycopg2.connect(DB, sslmode='require', connect_timeout=30)
cur = conn.cursor()

print('Creating schema ...')
cur.execute(SCHEMA_FILE.read_text())
conn.commit()

print('Inserting ...')
t0 = time.time()
data = [
    (r['master_cid'], r['slave_hadith_id'], normalize(r.get('comment', '')), r.get('sort'))
    for r in rows
    if r.get('master_cid', 0) > 0 and r.get('slave_hadith_id', 0) > 0
]
psycopg2.extras.execute_values(
    cur,
    """INSERT INTO matn_comparison (master_compound_id, slave_hadith_id, description, match_sort)
       VALUES %s ON CONFLICT DO NOTHING""",
    data, page_size=500
)
conn.commit()
print(f'Done — inserted {len(data)} rows in {time.time()-t0:.1f}s')

cur.close()
conn.close()
