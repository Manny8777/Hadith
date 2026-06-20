#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FULL extraction of المسند المصنف المعلل (docs/ilal/Book/musnad.db) into the
ilal_* tables, with the railway "lens" matched via takhrij group-mode (robust
to edition numbering differences).

Usage: python db/ilal_extract_all.py [--limit N]   (N = first N companions, for testing)
"""
import sqlite3, re, sys, unicodedata, psycopg2
from psycopg2.extras import execute_values

MUSNAD = r"C:\HadithProg\docs\ilal\Book\musnad.db"
PG = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"
LIMIT = None
if "--limit" in sys.argv: LIMIT = int(sys.argv[sys.argv.index("--limit")+1])

AR = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'}
def ar2s(s): return ''.join(AR.get(c,c) for c in str(s if s is not None else ''))
def ar2i(s):
    m=re.search(r'\d+',ar2s(s)); return int(m.group()) if m else None
def clean(s): return re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',s or '')).strip()
def st(s): return ''.join(c for c in unicodedata.normalize('NFC',s or '') if unicodedata.category(c)!='Mn')

BOOKMAP={'النسائي في الكبرى':22,'النسائي الكبرى':22,'عبد الله بن أحمد':8,'البخاري':1,'مسلم':2,
 'أبو داود':3,'أبي داود':3,'الترمذي':4,'النسائي':5,'ابن ماجة':6,'ابن ماجه':6,'مالك':7,'أحمد':8,
 'الدارمي':9,'ابن حبان':10,'ابن خزيمة':11,'الطبراني':12,'ابن أبي شيبة':15,'عبد الرزاق':16,
 'البيهقي':17,'الدارقطني':18,'البزار':19,'الحميدي':20,'الطيالسي':21,'أبو يعلى':23,'الحاكم':24,
 'عبد بن حميد':29,'سعيد بن منصور':30}
BMS={st(k):v for k,v in BOOKMAP.items()}
CORE_PREF=[3,4,6,2,1,5,10,11,9,8,15,16,17,18,24,22,12,19,23,20,29,21,30,7]  # representative pick order

# book name (longest first) + optional «», optional «vol/page», then (number)
_BALT='|'.join(re.escape(b) for b in sorted(BMS,key=len,reverse=True))
CITE=re.compile(r'(?:«\s*)?('+_BALT+r')\s*»?\s*(?:[٠-٩]+\s*[/،]\s*[٠-٩]+\s*)?\(\s*([٠-٩]+)\s*\)')

def slugify(name, seq):
    base=re.sub(r'[^\w]+','-',st(name)).strip('-')[:40] or 'companion'
    return f"{seq}-{base}" if seq else base

def parse_entry(body, foot, qulna):
    body=clean(body); foot=clean(foot)
    body=re.sub(r'^\s*[٠-٩]+\s*-\s*','',body)
    qi=body.find('«'); ai=body.find('أخرجه')
    isnad_ctx = body[:qi].strip(' ؛:') if 0<qi<400 else (body[:ai].strip(' ؛:')[:300] if ai>0 else '')
    mm=re.search(r'«([^»]*)»',body); matn=mm.group(1).strip() if mm else ''
    takhrij_raw=body[ai:] if ai>=0 else body
    la=re.search(r'اللفظ\s+ل[^\.\(،]+',foot); lafz=la.group(0).strip() if la else None
    # citations (match on tashkeel-stripped text — normalizes الدَّارِمي→الدارمي etc.)
    tx=st(takhrij_raw)
    cites=[]; seen=set()
    for m in CITE.finditer(tx):
        bk=m.group(1); no=m.group(2); bid=BMS.get(bk)
        if not bid or (bid,no) in seen: continue
        seen.add((bid,no))
        isn=tx[m.end():m.end()+150].split('. و')[0].split('. «')[0].strip()
        cites.append({'book':bk,'no':no,'no_int':ar2i(no),'bid':bid,'isnad':isn[:300]})
    # ilal (criticism)
    ilal=[]
    for m in re.finditer(r'قال\s+([^\:؛]{2,28}?)\s*:\s*([^«\.]{4,200}?)\.?\s*«([^»]+)»\s*([٠-٩/ ]*)',foot):
        say=m.group(2).strip(); gl=None
        for g in ['لا يعرف','مجهول','لا يصح','ضعيف','منكر','متروك','ثقة','صدوق','صحيح','حسن']:
            if g in say or g in (qulna or ''): gl=g; break
        ilal.append({'sci':m.group(1).strip(),'say':say,'gl':gl,'ref':(m.group(3).strip()+' '+m.group(4).strip()).strip()})
    # refs
    refs=[]
    for m in re.finditer(r'(المسند الجامع|تحفة الأشراف|الطبراني|الدارقُطني|الدارقطني|ابن أبي عاصم|البيهقي|أحمد)\s*(?:في\s*«[^»]+»)?\s*\(\s*([٠-٩ و]+)\s*\)',foot):
        rb=m.group(1).strip(); kind='primary-index' if rb in ('المسند الجامع','تحفة الأشراف') else 'secondary'
        refs.append({'book':rb,'no':m.group(2).strip(),'kind':kind})
    return dict(isnad_ctx=isnad_ctx, matn=matn, lafz=lafz, cites=cites, ilal=ilal, refs=refs)

def main():
    print("loading railway match indexes ...", flush=True)
    pg=psycopg2.connect(PG); cur=pg.cursor()
    num2main={}
    cur.execute("SELECT main_id,book_id,tarqeem_matboa1,tarqeem_harf,tarqeem_matboa2 FROM hadith_toc WHERE is_leaf=true")
    for mid,bid,m1,mh,m2 in cur.fetchall():
        for v in (m1,mh,m2):
            if v and str(v).strip().isdigit():
                num2main.setdefault((bid,str(int(v))),mid)
    print(f"  num2main: {len(num2main)}", flush=True)
    main2group={}; group_members={}
    cur.execute("SELECT t.hadith_id,t.group_id,h.book_id FROM takhrij t JOIN hadith_toc h ON h.main_id=t.hadith_id")
    for mid,gid,bid in cur.fetchall():
        main2group[mid]=gid; group_members.setdefault(gid,[]).append((bid,mid))
    print(f"  groups: {len(group_members)}", flush=True)

    def resolve(cites):
        # candidate main_ids from citations via number index
        cand=[]
        for c in cites:
            mid=num2main.get((c['bid'],str(c['no_int']))) if c['no_int'] is not None else None
            if mid: cand.append(mid)
        if not cand: return None,None
        # group-mode: pick the most common group among candidates
        from collections import Counter
        grps=Counter(main2group[m] for m in cand if m in main2group)
        if not grps:
            return cand[0],None
        gid=grps.most_common(1)[0][0]
        members={b:m for b,m in group_members.get(gid,[])}
        rep=next((members[b] for b in CORE_PREF if b in members), cand[0])
        return rep,gid,members
    # (resolve returns 2 or 3-tuple; normalize below)

    sq=sqlite3.connect(MUSNAD); sq.row_factory=sqlite3.Row
    comps=sq.execute("SELECT title_page,title FROM companions ORDER BY title_page").fetchall()
    if LIMIT: comps=comps[:LIMIT]
    comp_pages=[c['title_page'] for c in comps]
    pages={r['page_num']:r for r in sq.execute("SELECT * FROM pages")}
    maxpg=max(pages)

    # ── PASS 1: parse everything into memory (fast, local) ──
    print("parsing musnad.db ...", flush=True)
    companions=[]; used_slugs=set()
    for ci,c in enumerate(comps):
        tp=c['title_page']; title=clean(c['title'])
        seq=ar2i(title.split('-')[0]) if '-' in title else None
        name=title.split('-',1)[1].strip() if '-' in title else title
        tar=clean(pages[tp]['foot']) if tp in pages and pages[tp]['foot'] else None
        nexttp=comp_pages[ci+1] if ci+1<len(comp_pages) else maxpg+1
        ents=[]; cur_e=None
        for p in range(tp,nexttp):
            pg_=pages.get(p)
            if not pg_: continue
            hn=pg_['hadith_num']
            if p==tp and hn is None:
                mb=re.search(r'([٠-٩]+)\s*-\s*(?:عن|حدثنا|أخبرنا|قال|أنه|عَن|حَدَّثَنَا)',clean(pg_['body']))
                if mb: hn=ar2i(mb.group(1))
            if hn is not None:
                cur_e={'hno':hn,'pages':[p],'fw':[],'print':pg_['print_page']}; ents.append(cur_e)
            elif pg_['has_fawaid'] and cur_e is not None: cur_e['fw'].append(p)
            elif cur_e is not None: cur_e['pages'].append(p)
        parsed=[]
        for eseq,e in enumerate(ents,1):
            body=' '.join(clean(pages[p]['body']) for p in e['pages'] if pages[p]['body'])
            foot=' '.join(clean(pages[p]['foot']) for p in e['pages']+e['fw'] if pages[p]['foot'])
            qulna=next((clean(pages[p]['qulna']) for p in e['fw'] if pages[p]['qulna']),None)
            fw_foot=' '.join(clean(pages[p]['body']) for p in e['fw'] if pages[p]['body'])
            P=parse_entry(body, foot+' '+fw_foot, qulna)
            r=resolve(P['cites']); rep,gid=(r[0],r[1]) if r else (None,None)
            members=r[2] if r and len(r)>2 else {}
            P.update(seq=eseq,hno=e['hno'],qulna=qulna,print=e['print'],page=e['pages'][0],
                     rep=rep,gid=gid,members=members,body=body[:8000],foot=foot[:8000])
            parsed.append(P)
        slug=slugify(name,seq)
        if slug in used_slugs:
            k=2
            while f"{slug}-{k}" in used_slugs: k+=1
            slug=f"{slug}-{k}"
        used_slugs.add(slug)
        companions.append(dict(seq=seq,name=name,slug=slug,tp=tp,tarjama=tar,entries=parsed))

    # ── PASS 2: bulk insert ──
    print("bulk inserting ...", flush=True)
    cur.execute("TRUNCATE ilal_refs,ilal_ilal,ilal_takhrij,ilal_entries,ilal_companions RESTART IDENTITY CASCADE")
    comp_ids=[r[0] for r in execute_values(cur,
        "INSERT INTO ilal_companions(seq,name,slug,title_page,tarjama,narrator_id) VALUES %s RETURNING id",
        [(c['seq'],c['name'],c['slug'],c['tp'],c['tarjama'],None) for c in companions], page_size=1000, fetch=True)]

    entry_vals=[]; owners=[]
    for cidx,c in enumerate(companions):
        for e in c['entries']:
            entry_vals.append((comp_ids[cidx],e['seq'],e['hno'],e['isnad_ctx'],e['matn'],e['lafz'],
                               e['qulna'],e['print'],e['page'],e['rep'],e['gid'],e['body'],e['foot']))
            owners.append(e)
    eids=[r[0] for r in execute_values(cur,
        """INSERT INTO ilal_entries(companion_id,seq,hadith_no,isnad_context,matn,lafz_attr,
           judgment,print_page,page_num,matched_main_id,takhrij_group_id,body_raw,foot_raw)
           VALUES %s RETURNING id""", entry_vals, page_size=1000, fetch=True)]

    tk=[]; il=[]; rf=[]; matched=0
    for eid,e in zip(eids,owners):
        if e['rep']: matched+=1
        for i,c in enumerate(e['cites']):
            tk.append((eid,i+1,c['book'],c['no'],c['no_int'],c['bid'],e['members'].get(c['bid']),c['isnad'],
                       'matched' if e['members'].get(c['bid']) else 'unmatched'))
        for i,c in enumerate(e['ilal']): il.append((eid,i+1,c['sci'],c['say'],c['gl'],c['ref']))
        for i,c in enumerate(e['refs']): rf.append((eid,i+1,c['book'],c['no'],c['kind']))
    def bulk(sql,rows):
        for i in range(0,len(rows),3000): execute_values(cur,sql,rows[i:i+3000])
    bulk("INSERT INTO ilal_takhrij(entry_id,sort,source_book,source_no,source_no_int,railway_book_id,matched_main_id,isnad_text,match_status) VALUES %s",tk)
    bulk("INSERT INTO ilal_ilal(entry_id,sort,scientist,say_text,garh_label,source_ref) VALUES %s",il)
    bulk("INSERT INTO ilal_refs(entry_id,sort,ref_book,ref_no,kind) VALUES %s",rf)
    pg.commit()
    print("\n=== DONE ===")
    print(f"  companions: {len(comp_ids)}\n  entries: {len(eids)}  (matched {matched}, {matched/max(1,len(eids))*100:.1f}%)")
    print(f"  takhrij: {len(tk)}\n  ilal: {len(il)}\n  refs: {len(rf)}")
    pg.close(); sq.close()

if __name__=='__main__': main()
