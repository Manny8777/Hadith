"""
seed_services.py — streams HadithServicesState.json into hadith_services table
Uses ijson for streaming (large file), batch size 500, ON CONFLICT DO NOTHING
"""
import time, sys
import ijson
import psycopg2
import psycopg2.extras
from pathlib import Path

DATA = Path(r'C:\HadithProg\railway\extract\data_named')
DB = 'postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway'

print("Connecting to database ...", flush=True)
conn = psycopg2.connect(DB, connect_timeout=30, sslmode='require')
conn.autocommit = False
cur = conn.cursor()

INSERT_SQL = """
INSERT INTO hadith_services
    (hadith_id, takhreg, compound_matn, rwah, asnad, shawahed, ghareeb, degree,
     sharh, subjects, tafsser, biography, medicine, feqh, asbab, mokhtalaf, amthal, motawater)
VALUES %s
ON CONFLICT DO NOTHING
"""

batch = []
BATCH = 500
total = 0
t0 = time.time()

print("Streaming HadithServicesState.json ...", flush=True)

with open(DATA / 'HadithServicesState.json', 'rb') as f:
    for r in ijson.items(f, 'item'):
        batch.append((
            r['HadithMainID'],
            bool(r.get('Takhreg', False)),
            bool(r.get('CompoundMatn', False)),
            bool(r.get('Rwah', False)),
            bool(r.get('Asnad', False)),
            bool(r.get('Shawahed', False)),
            bool(r.get('Ghareeb', False)),
            bool(r.get('Degree', False)),
            bool(r.get('Sharh', False)),
            bool(r.get('Subjects', False)),
            bool(r.get('Tafsser', False)),
            bool(r.get('Biography', False)),
            bool(r.get('Medicine', False)),
            bool(r.get('Feqh', False)),
            bool(r.get('Asbab', False)),
            bool(r.get('Mokhtalaf', False)),
            bool(r.get('Amthal', False)),
            bool(r.get('Motawater', False)),
        ))
        if len(batch) >= BATCH:
            psycopg2.extras.execute_values(cur, INSERT_SQL, batch, page_size=BATCH)
            conn.commit()
            total += len(batch)
            batch = []
            if total % 50000 == 0:
                elapsed = time.time() - t0
                print(f"  {total:,} rows inserted ({elapsed:.0f}s)", flush=True)

if batch:
    psycopg2.extras.execute_values(cur, INSERT_SQL, batch, page_size=BATCH)
    conn.commit()
    total += len(batch)

cur.execute('SELECT COUNT(*) FROM hadith_services')
count = cur.fetchone()[0]
elapsed_total = time.time() - t0
print(f"\nDone. Processed {total:,} rows in {elapsed_total:.1f}s", flush=True)
print(f"COUNT(*) in hadith_services: {count:,}", flush=True)

cur.close()
conn.close()
