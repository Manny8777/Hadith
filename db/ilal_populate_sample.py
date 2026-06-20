#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Populate the ilal_* tables for ONE companion (أبيض بن حمال, ح97-100) as the
sample. Parses docs/ilal/Book/musnad.db, text-matches each entry to a railway
hadith_toc.main_id (edition-proof bridge → IsnadTree via takhrij.group_id),
and inserts companion + entries + takhrij + ilal + refs.
"""
import sqlite3, re, unicodedata, psycopg2

MUSNAD = r"C:\HadithProg\docs\ilal\Book\musnad.db"
PG = "postgresql://postgres:bJmkMzZQLqhzYltMNDwentYAPFUAppSq@tramway.proxy.rlwy.net:39193/railway"

AR = {'٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9'}
def ar2i(s):
    d=''.join(AR.get(c,c) for c in (s or ''))
    m=re.search(r'\d+',d); return int(m.group()) if m else None
def clean(s): return re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',s or '')).strip()
def strip_tash(s): return ''.join(c for c in unicodedata.normalize('NFC',s or '') if unicodedata.category(c)!='Mn')

# railway book_id for source names cited in التخريج
BOOKMAP={'البخاري':1,'مسلم':2,'أبو داود':3,'أبي داود':3,'أبو داوُد':3,'الترمذي':4,'النسائي':5,
 'ابن ماجة':6,'ابن ماجه':6,'مالك':7,'أحمد':8,'الدارمي':9,'الدَّارمي':9,'الدَّارِمي':9,'ابن حبان':10,
 'ابن خزيمة':11,'ابن أبي شيبة':15,'عبد الرزاق':16,'البيهقي':17,'الدارقطني':18,'الدارقُطني':18,
 'الحاكم':24,'النسائي في الكبرى':22,'الطبراني':12,'البزار':19,'أبو يعلى':23,'الحميدي':20}
# representative main_id per المسند hadith number (text-verified)
REP={97:93192, 98:111375, 99:98626, 100:93240}

def main():
    sq=sqlite3.connect(MUSNAD); sq.row_factory=sqlite3.Row
    pg=psycopg2.connect(PG); cur=pg.cursor()

    # ── companion ──
    comp=sq.execute("SELECT * FROM companions WHERE title LIKE '%أبيض بن حمال%'").fetchone()
    title=comp['title']                     # "٤ - أبيض بن حمال المأربي"
    seq=ar2i(title.split('-')[0]); name=title.split('-',1)[1].strip()
    # tarjama from the title page foot
    tp=sq.execute("SELECT foot FROM pages WHERE page_num=?",(comp['title_page'],)).fetchone()
    tarjama=clean(tp['foot']) if tp and tp['foot'] else None
    cur.execute("DELETE FROM ilal_companions WHERE slug=%s",('abyad-ibn-hammal',))
    cur.execute("""INSERT INTO ilal_companions(seq,name,slug,title_page,tarjama,narrator_id)
                   VALUES(%s,%s,%s,%s,%s,%s) RETURNING id""",
                (seq,name,'abyad-ibn-hammal',comp['title_page'],tarjama,399))
    comp_id=cur.fetchone()[0]
    print(f"companion #{comp_id}: {name} (seq {seq}, narrator 399)")

    # ── entries: pages 323..332 ──
    pages={r['page_num']:r for r in sq.execute("SELECT * FROM pages WHERE page_num BETWEEN 323 AND 332")}
    # body pages: 323(ح97 shares title), 325(98), 327-329(99), 331(100); fawaid: 324,326,330,332
    ENTRIES=[(97,[323],324),(98,[325],326),(99,[327,328,329],330),(100,[331],332)]
    for eseq,(hno,bps,fwp) in enumerate(ENTRIES,1):
        body=' '.join(clean(pages[p]['body']) for p in bps if p in pages and pages[p]['body'])
        foot=' '.join(clean(pages[p]['foot']) for p in bps if p in pages and pages[p]['foot'])
        # strip leading "NUM -"
        body=re.sub(r'^\s*[٠-٩]+\s*-\s*','',body)
        # isnad_context = up to first «
        qi=body.find('«')
        isnad_ctx=body[:qi].strip(' ؛:') if qi>0 else ''
        mm=re.search(r'«([^»]*)»',body); matn=mm.group(1).strip() if mm else ''
        # takhrij = from أخرجه onward
        ti=body.find('أخرجه'); takhrij_raw=body[ti:] if ti>=0 else ''
        # judgment from fawaid page qulna
        fw=pages.get(fwp); judgment=clean(fw['qulna']) if fw and fw['qulna'] else None
        fw_body=clean(fw['body']) if fw and fw['body'] else ''
        # lafz attribution
        la=re.search(r'اللفظ\s+ل([^\.\(]+)',foot); lafz=la.group(0).strip() if la else None
        print_page=pages[bps[0]]['print_page']

        # representative match + group for the lens (drives IsnadTree on the page)
        rep=REP.get(hno); grp=None
        if rep:
            cur.execute("SELECT group_id FROM takhrij WHERE hadith_id=%s LIMIT 1",(rep,))
            r=cur.fetchone(); grp=r[0] if r else None

        cur.execute("""INSERT INTO ilal_entries(companion_id,seq,hadith_no,isnad_context,matn,
                       lafz_attr,judgment,print_page,page_num,matched_main_id,takhrij_group_id,body_raw,foot_raw)
                       VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""",
                    (comp_id,eseq,hno,isnad_ctx,matn,lafz,judgment,print_page,bps[0],rep,grp,body,foot))
        eid=cur.fetchone()[0]
        # ── takhrij citations: «BOOK» (NUM) or BOOK (NUM) ──
        seen=set(); sort=0
        for m in re.finditer(r'(?:«\s*([^»]+?)\s*»|((?:ابن |أبو |أبي |الـ?)?[؀-ۿ]{3,}(?:\s+(?:بن|أبي|في)\s+[؀-ۿ]+){0,3}))\s*\(\s*([٠-٩]+)\s*\)',takhrij_raw):
            bk=(m.group(1) or m.group(2) or '').strip(); no=m.group(3)
            key=strip_tash(bk)
            bid=next((v for k,v in BOOKMAP.items() if strip_tash(k)==key or strip_tash(k) in key),None)
            if not bid: continue
            if (bid,no) in seen: continue
            seen.add((bid,no))
            sort+=1
            # match to group member of the representative
            mid=None; status='unmatched'; note=None
            if rep:
                cur.execute("""SELECT h.main_id FROM takhrij t JOIN hadith_toc h ON h.main_id=t.hadith_id
                               WHERE t.group_id=(SELECT group_id FROM takhrij WHERE hadith_id=%s LIMIT 1)
                               AND h.book_id=%s ORDER BY h.main_id LIMIT 1""",(rep,bid))
                r=cur.fetchone()
                if r: mid=r[0]; status='matched'
            isn=takhrij_raw[m.end():m.end()+160]; isn=isn.split('. و')[0].split('. «')[0].strip()
            cur.execute("""INSERT INTO ilal_takhrij(entry_id,sort,source_book,source_no,source_no_int,
                           railway_book_id,matched_main_id,isnad_text,match_status)
                           VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                        (eid,sort,bk,no,ar2i(no),bid,mid,isn[:300],status))

        # ── ilal: criticism quotes in fawaid (قال X: ... . «ref») ──
        isort=0
        for m in re.finditer(r'قال\s+([^\:؛]{2,30}?)\s*:\s*([^«\.]{4,200}?)\.?\s*«([^»]+)»\s*([٠-٩/ ]*)',fw_body):
            isort+=1
            scientist=m.group(1).strip(); say=m.group(2).strip(); ref=m.group(3).strip()+' '+m.group(4).strip()
            gl=None
            for g in ['لا يعرف','مجهول','لا يصح','ضعيف','منكر','متروك','ثقة','صدوق']:
                if g in say or g in (judgment or ''): gl=g; break
            cur.execute("""INSERT INTO ilal_ilal(entry_id,sort,scientist,say_text,garh_label,source_ref)
                           VALUES(%s,%s,%s,%s,%s,%s)""",(eid,isort,scientist,say,gl,ref.strip()))

        # ── refs: المسند الجامع / تحفة الأشراف / secondary ──
        rsort=0
        for m in re.finditer(r'(المسند الجامع|تحفة الأشراف|الطبراني|الدارقُطني|ابن أبي عاصم|البيهقي)\s*(?:في\s*«[^»]+»)?\s*\(\s*([٠-٩ و]+)\s*\)',foot):
            rsort+=1; rb=m.group(1).strip()
            kind='primary-index' if rb in ('المسند الجامع','تحفة الأشراف') else 'secondary'
            cur.execute("INSERT INTO ilal_refs(entry_id,sort,ref_book,ref_no,kind) VALUES(%s,%s,%s,%s,%s)",
                        (eid,rsort,rb,m.group(2).strip(),kind))

        # store representative on entry via takhrij (already) — report
        nt=cur.execute if False else None
        print(f"  ح{hno}: matn[{len(matn)}] rep_main={rep} | takhrij={sort} | ilal={isort} | refs={rsort} | حكم={judgment[:30] if judgment else '—'}")

    pg.commit()
    # summary
    for t in ['ilal_companions','ilal_entries','ilal_takhrij','ilal_ilal','ilal_refs']:
        cur.execute(f"SELECT COUNT(*) FROM {t}"); print(f"  {t}: {cur.fetchone()[0]}")
    pg.close(); sq.close()

if __name__=='__main__': main()
