#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Backfill narrator links into the ilal_* tables (post-extraction):
  1. ilal_companions.narrator_id  ← railway صحابي narrator (name token-subset match)
  2. ilal_ilal.narrator_id        ← the criticized narrator, constrained to the
                                     entry's matched chain narrators (reliable).
"""
import re, unicodedata, psycopg2
PG = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"

def st(s): return ''.join(c for c in unicodedata.normalize('NFC',s or '') if unicodedata.category(c)!='Mn')
def toks(s):
    s=st(s); s=re.sub(r'[^؀-ۿ ]',' ',s)
    out=set()
    for t in s.split():
        t=t[2:] if t.startswith('ال') and len(t)>4 else t
        if t and t!='عن': out.add(t)   # keep kunya/بن (part of names)
    return out

def main():
    pg=psycopg2.connect(PG); cur=pg.cursor()

    # ── 1. companion → narrator (match against name/abb_name/esm_shuhra/kunia) ──
    cur.execute("SELECT id,name,abb_name,esm_shuhra,kunia FROM narrators WHERE is_companion=true")
    rcomps=[]                                # (id, [token-set per field])
    for rid,nm,ab,sh,ku in cur.fetchall():
        fields=[t for t in (toks(nm),toks(ab),toks(sh),toks(ku)) if len(t)>=2]
        if fields: rcomps.append((rid,fields))
    cur.execute("UPDATE ilal_companions SET narrator_id=NULL")
    cur.execute("SELECT id,name FROM ilal_companions")
    comp_rows=cur.fetchall(); linked=0
    for cid,name in comp_rows:
        ct=toks(name)
        if len(ct)<2: continue
        best=None; bestscore=0
        for rid,fields in rcomps:
            for ft in fields:
                if ft<=ct and len(ft)>bestscore:   # a railway name-form fully inside the book name
                    bestscore=len(ft); best=rid
        if best:
            cur.execute("UPDATE ilal_companions SET narrator_id=%s WHERE id=%s",(best,cid)); linked+=1
    pg.commit()
    print(f"companions linked: {linked}/{len(comp_rows)}")

    # ── 2. علل → narrator (within the entry's chain) ──
    # entries that have علل + a matched chain
    cur.execute("""SELECT DISTINCT e.matched_main_id FROM ilal_entries e
                   JOIN ilal_ilal i ON i.entry_id=e.id WHERE e.matched_main_id IS NOT NULL""")
    mids=[r[0] for r in cur.fetchall()]
    print(f"entries-with-علل matched main_ids: {len(mids)}")
    # chain narrators per main_id
    main_nars={}
    for i in range(0,len(mids),2000):
        cur.execute("""SELECT ih.hadith_id, ic.narrator_ids FROM isnad_hadiths ih
                       JOIN isnad_chains ic ON ic.id=ih.isnad_id WHERE ih.hadith_id = ANY(%s)""",(mids[i:i+2000],))
        for mid,nids in cur.fetchall():
            s=main_nars.setdefault(mid,set())
            for x in (nids or '').split():
                if x.isdigit(): s.add(int(x))
    allnar=set().union(*main_nars.values()) if main_nars else set()
    narname={}
    allnar=list(allnar)
    for i in range(0,len(allnar),5000):
        cur.execute("SELECT id,name,abb_name FROM narrators WHERE id = ANY(%s)",(allnar[i:i+5000],))
        for nid,nm,ab in cur.fetchall(): narname[nid]=(toks(nm),toks(ab))
    # match each علة
    cur.execute("""SELECT i.id,i.say_text,e.matched_main_id FROM ilal_ilal i
                   JOIN ilal_entries e ON e.id=i.entry_id WHERE e.matched_main_id IS NOT NULL""")
    rows=cur.fetchall(); il_linked=0; ups=[]
    for iid,say,mid in rows:
        sset=toks(say); cands=main_nars.get(mid,set())
        best=None; bestov=0
        for nid in cands:
            nt,at=narname.get(nid,(set(),set()))
            ov=len(nt & sset)
            if nt and nt<=sset: ov+=5            # full name inside the quote = strong
            if ov>bestov and ov>=2: bestov=ov; best=nid
        if best: ups.append((best,iid)); il_linked+=1
    from psycopg2.extras import execute_values
    execute_values(cur,"UPDATE ilal_ilal SET narrator_id=data.nid FROM (VALUES %s) AS data(nid,iid) WHERE ilal_ilal.id=data.iid",ups)
    pg.commit()
    print(f"علل linked: {il_linked}/{len(rows)}")
    pg.close()

if __name__=='__main__': main()
