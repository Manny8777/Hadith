export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import IsnadTree from '@/app/components/IsnadTree'
import { getChainsForHadith } from '@/lib/isnadChains'

interface Companion { id: number; seq: number; name: string; slug: string; tarjama: string | null; narrator_id: number | null }
interface Entry {
  id: number; seq: number; hadith_no: number; isnad_context: string | null; matn: string | null
  lafz_attr: string | null; judgment: string | null; fawaid: string | null; print_page: number | null
  matched_main_id: number | null; takhrij_group_id: number | null
}
interface Takhrij {
  id: number; entry_id: number; sort: number; source_book: string | null; source_no: string | null
  railway_book_id: number | null; matched_main_id: number | null; isnad_text: string | null; match_status: string | null
}
interface Ilal { id: number; entry_id: number; narrator_id: number | null; narrator_name: string | null; scientist: string | null; say_text: string | null; garh_label: string | null; source_ref: string | null }
interface Ref { id: number; entry_id: number; ref_book: string | null; ref_no: string | null; kind: string | null }

const toLatinDigits = (s: string) => s.replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/\D/g, '')

// render the book's «الفوائد» text faithfully: split on the book's bullet dashes,
// bold each "قلنا:/قال فلان:" lead, and mute the «source» references
function FawaidText({ text }: { text: string }) {
  const items = text.split(/\s+[-ـ]\s+(?=قلنا|قال|وقال|أخرجه|وأخرجه|انظر|ورواه|رواه)/).map(s => s.trim()).filter(Boolean)
  const renderInline = (seg: string, key: number) => {
    // split keeping «...» reference groups (plus any trailing volume/number) intact
    const parts = seg.split(/(«[^»]*»\s*[٠-٩]*\s*[/،]?\s*[٠-٩]*|\([٠-٩\s]+\))/g).filter(Boolean)
    return parts.map((p, i) =>
      (p.startsWith('«') || p.startsWith('('))
        ? <span key={i} className="text-teal-700 text-[12px] whitespace-nowrap">{p}</span>
        : <span key={i}>{p}</span>
    )
  }
  return (
    <div className="flex flex-col gap-2">
      {items.map((seg, i) => {
        const m = seg.match(/^((?:و?قلنا|و?قال(?:\s+[^\:؛]{1,28})?))\s*[:：]\s*([\s\S]*)$/)
        return (
          <p key={i} className="text-[14px] leading-loose text-gray-800 flex flex-wrap gap-x-1">
            {m
              ? <><strong className="text-gray-900">{m[1]}:</strong> {renderInline(m[2], i)}</>
              : renderInline(seg, i)}
          </p>
        )
      })}
    </div>
  )
}

function judgmentTone(j: string | null): string {
  if (!j) return 'bg-gray-100 text-gray-700 border-gray-200'
  if (/ضعيف|منكر|موضوع|لا يصح|باطل/.test(j)) return 'bg-red-50 text-red-700 border-red-200'
  if (/صحيح/.test(j)) return 'bg-green-50 text-green-800 border-green-200'
  if (/حسن/.test(j)) return 'bg-amber-50 text-amber-800 border-amber-200'
  return 'bg-gray-50 text-gray-700 border-gray-200'
}

const PER_PAGE = 12
export default async function MusnadCompanionPage({ params, searchParams }: { params: Promise<{ companion: string }>; searchParams: Promise<{ page?: string }> }) {
  const { companion: companionParam } = await params
  const slug = decodeURIComponent(companionParam)
  const sp = await searchParams
  const page = Math.max(1, parseInt(sp.page || '1') || 1)

  const compRes = await pool.query<Companion>(`SELECT * FROM ilal_companions WHERE slug = $1`, [slug])
  const companion = compRes.rows[0]
  if (!companion) notFound()

  const countRes = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ilal_entries WHERE companion_id = $1`, [companion.id])
  const totalEntries = countRes.rows[0]?.n ?? 0
  const totalPages = Math.max(1, Math.ceil(totalEntries / PER_PAGE))
  const offset = (Math.min(page, totalPages) - 1) * PER_PAGE

  const entriesRes = await pool.query<Entry>(
    `SELECT id, seq, hadith_no, isnad_context, matn, lafz_attr, judgment, fawaid, print_page, matched_main_id, takhrij_group_id
     FROM ilal_entries WHERE companion_id = $1 ORDER BY seq LIMIT ${PER_PAGE} OFFSET ${offset}`,
    [companion.id]
  )
  const entries = entriesRes.rows
  const entryIds = entries.map(e => e.id)

  const [takhrijRes, ilalRes, refsRes, bookTitlesRes] = await Promise.all([
    pool.query<Takhrij>(`SELECT * FROM ilal_takhrij WHERE entry_id = ANY($1::int[]) ORDER BY entry_id, sort`, [entryIds]),
    pool.query<Ilal>(`SELECT * FROM ilal_ilal WHERE entry_id = ANY($1::int[]) ORDER BY entry_id, sort`, [entryIds]),
    pool.query<Ref>(`SELECT * FROM ilal_refs WHERE entry_id = ANY($1::int[]) ORDER BY entry_id, sort`, [entryIds]),
    pool.query<{ id: number; title: string; print1_edition: string | null }>(`SELECT id, title, print1_edition FROM books`),
  ])
  const bookTitle: Record<number, string> = {}
  const bookEdition: Record<number, string> = {}      // the railway edition each link OPENS into
  bookTitlesRes.rows.forEach(b => { bookTitle[b.id] = b.title; if (b.print1_edition) bookEdition[b.id] = b.print1_edition })

  // railway's OWN number for each linked hadith — so we can show it when it differs from the
  // المسند citation number (different print editions renumber)
  const linkedIds = [...new Set(takhrijRes.rows.map(t => t.matched_main_id).filter((x): x is number => x != null))]
  const railwayNo: Record<number, string> = {}
  if (linkedIds.length) {
    const rn = await pool.query<{ main_id: number; n: string | null }>(
      `SELECT main_id, tarqeem_matboa1 AS n FROM hadith_toc WHERE main_id = ANY($1::int[])`, [linkedIds])
    rn.rows.forEach(r => { if (r.n) railwayNo[r.main_id] = String(r.n) })
  }
  const byEntry = <T extends { entry_id: number }>(rows: T[], id: number) => rows.filter(r => r.entry_id === id)

  // live isnad chains per entry (the lens → railway data)
  const chainsByEntry = await Promise.all(
    entries.map(e => e.matched_main_id ? getChainsForHadith(e.matched_main_id) : Promise.resolve({ chains: [], narratorCriticism: {} }))
  )

  return (
    <div dir="rtl" className="mx-auto max-w-4xl">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4 flex-wrap">
        <Link href="/musnad-musannaf" className="ui-link">المسند المصنف المعلل</Link>
        <span className="text-gray-300">›</span>
        <span>مسند الصحابة — حرف الألف</span>
        <span className="text-gray-300">›</span>
        <span className="text-gray-800 font-medium">{companion.seq} — {companion.name}</span>
      </nav>

      {/* companion banner */}
      <header className="ui-card mb-3 flex items-center justify-between gap-4 !p-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'var(--font-display)' }}>{companion.name} ﵁</h1>
          <div className="flex gap-3 text-xs text-gray-500 mt-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-green-600 inline-block" />صحابي</span>
            <span>📚 {totalEntries} أحاديث مسندة</span>
            {totalPages > 1 && <span>صفحة {page} من {totalPages}</span>}
            {companion.narrator_id && <Link href={`/narrator/${companion.narrator_id}`} className="ui-link">ترجمة الراوي ↗</Link>}
          </div>
        </div>
        <div className="text-5xl font-bold text-green-100 leading-none" style={{ fontFamily: 'var(--font-display)' }}>{companion.seq}</div>
      </header>

      {companion.tarjama && (
        <div className="ui-prose-block mb-5 text-sm">
          <span className="block text-[10.5px] font-bold text-gray-500 tracking-wider mb-1.5">ترجمة الصحابي</span>
          {companion.tarjama}
        </div>
      )}

      {entries.map((e, i) => {
        const tk = byEntry(takhrijRes.rows, e.id)
        const il = byEntry(ilalRes.rows, e.id)
        const rf = byEntry(refsRes.rows, e.id)
        const primaryRefs = rf.filter(r => r.kind === 'primary-index')
        const secondaryRefs = rf.filter(r => r.kind !== 'primary-index')
        const { chains, narratorCriticism } = chainsByEntry[i]

        return (
          <section key={e.id} className="mb-5">
            <div className="text-[13px] font-bold text-gray-600 my-3 flex items-center gap-2">
              الحديث {e.hadith_no}
              {e.print_page && <span className="text-[11px] text-gray-400 font-normal">المطبوع ص{e.print_page}</span>}
              <span className="flex-1 h-px bg-gray-200" />
            </div>

            <article className="ui-card overflow-hidden !p-0">
              <div className="px-5 py-3 bg-[var(--color-surface-sunken)] border-b border-[var(--color-border)] flex items-center gap-2">
                <span className="min-w-8 h-8 rounded-full bg-green-800 text-white flex items-center justify-center text-xs font-bold">{e.hadith_no}</span>
                <span className="ui-chip">مرفوع</span>
                {e.judgment && <span className={`text-[11px] px-2 py-1 rounded border font-semibold ${judgmentTone(e.judgment)}`}>{e.judgment.split('؛')[0]}</span>}
                {e.matched_main_id && <Link href={`/hadith/${e.matched_main_id}`} className="ms-auto text-[11px] ui-link">الحديث في railway ↗</Link>}
              </div>

              <div className="px-5 py-4">
                {e.isnad_context && <p className="text-sm text-gray-600 mb-3 leading-loose hadith-sanad">{e.isnad_context}</p>}

                {/* matn — hero */}
                {e.matn && (
                  <div className="relative rounded-lg border-[1.5px] border-amber-300 bg-gradient-to-br from-amber-50 to-amber-50/40 px-5 py-4 mb-3">
                    <span className="absolute right-0 top-0 bottom-0 w-1 bg-amber-500 rounded-s-md" />
                    <p className="hadith-matn !text-[1.25rem] leading-loose text-gray-900">
                      <span className="text-amber-700">«</span>{e.matn}<span className="text-amber-700">»</span>
                    </p>
                    {e.lafz_attr && <span className="inline-block mt-2 text-[11px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded font-semibold">{e.lafz_attr}</span>}
                  </div>
                )}

                {/* live isnad — reused IsnadTree */}
                {chains.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-2 flex items-center gap-2">
                      الإسناد والرواة <span className="font-normal text-gray-400">— من بيانات railway (تخريج #{e.takhrij_group_id})</span>
                      <span className="flex-1 h-px bg-gray-200" />
                    </div>
                    <IsnadTree hadithId={e.matched_main_id!} chains={chains} narratorCriticism={narratorCriticism} />
                  </div>
                )}

                {/* takhrij sources → lens into railway */}
                {tk.length > 0 && (
                  <div className="mt-4">
                    <div className="text-[11px] font-bold text-gray-500 tracking-wider mb-1.5 flex items-center gap-2">مصادر التخريج<span className="flex-1 h-px bg-gray-200" /></div>
                    <p className="text-[10.5px] text-gray-400 mb-2 leading-relaxed">الرقم بترقيم «المسند المصنف»؛ والرابط يفتح الحديث نفسه في نسخة المكتبة المعتمدة في الموقع — وقد يختلف ترقيمها.</p>
                    <div className="flex flex-col gap-1.5">
                      {tk.map(t => {
                        const rNo = t.matched_main_id != null ? railwayNo[t.matched_main_id] : undefined
                        const citedLatin = toLatinDigits(t.source_no || '')
                        const numDiffers = rNo != null && rNo !== citedLatin
                        const edition = t.railway_book_id != null ? bookEdition[t.railway_book_id] : undefined
                        return (
                        <div key={t.id} className="px-3 py-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border)] text-sm flex items-start gap-2.5">
                          <span className="bg-green-100 text-green-800 px-2 py-0.5 rounded text-[11.5px] font-bold shrink-0">{t.source_no}</span>
                          <div className="min-w-0 flex-1">
                            <span className="flex items-center gap-2 flex-wrap">
                              {t.matched_main_id
                                ? <Link href={`/hadith/${t.matched_main_id}`} className="font-bold text-green-800 hover:underline">{t.source_book}</Link>
                                : <span className="font-bold text-gray-700">{t.source_book}</span>}
                              {edition && (
                                <span className="inline-block text-[10px] bg-teal-50 text-teal-700 px-1.5 py-0.5 rounded" title={`الرابط يفتح نسخة: ${edition}`}>📖 {edition}</span>
                              )}
                              {numDiffers && (
                                <span className="inline-block text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded" title="ترقيم نسخة الموقع يختلف عن ترقيم المسند المصنف">↩ رقمه في النسخة: {rNo}</span>
                              )}
                            </span>
                            {t.isnad_text && <div className="text-gray-500 text-[12.5px] mt-0.5 leading-relaxed">{t.isnad_text}</div>}
                          </div>
                        </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* الفوائد — نصّ المؤلفين كاملًا (الحكم + تحليل العلل + أقوال النقاد) */}
                {(e.fawaid || il.length > 0) && (
                  <div className="mt-4 rounded-lg border border-amber-200/70 overflow-hidden">
                    <div className="px-3.5 py-2 bg-amber-50/70 border-b border-amber-200/70 text-[12.5px] font-bold text-amber-900 flex items-center gap-2">
                      <span>الفوائد</span>
                      <span className="text-[10px] font-normal text-amber-700/70">تحليل المؤلفين وأقوال النقاد في العلل</span>
                    </div>
                    <div className="px-4 py-3 bg-white">
                      {e.fawaid
                        ? <FawaidText text={e.fawaid} />
                        : (
                          <div className="flex flex-col divide-y divide-gray-100">
                            {il.map(x => (
                              <div key={x.id} className="py-2 text-sm leading-relaxed text-gray-700">
                                <strong className="text-gray-900">{x.scientist}:</strong> {x.say_text}
                                {x.source_ref && <span className="text-teal-700 text-[12px]"> {x.source_ref}</span>}
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                )}

                {/* refs */}
                {(primaryRefs.length > 0 || secondaryRefs.length > 0) && (
                  <div className="mt-3 text-[12px] text-gray-500 px-3 py-2 bg-[var(--color-surface-sunken)] rounded-md border border-[var(--color-border)]">
                    {primaryRefs.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap items-center">
                        {primaryRefs.map(r => <span key={r.id} className="bg-teal-50 text-teal-700 px-2 py-0.5 rounded font-semibold">{r.ref_book} ({r.ref_no})</span>)}
                      </div>
                    )}
                    {secondaryRefs.length > 0 && (
                      <div className="mt-1.5"><strong className="text-gray-600">مصادر ثانوية:</strong> {secondaryRefs.map(r => `${r.ref_book} (${r.ref_no})`).join('، ')}</div>
                    )}
                  </div>
                )}
              </div>
            </article>
          </section>
        )
      })}

      {totalPages > 1 && (
        <nav className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-[var(--color-border)]">
          {page > 1
            ? <Link href={`/musnad-musannaf/${companion.slug}?page=${page - 1}`} className="ui-card !py-2 !px-4 text-sm text-gray-700 hover:text-green-800 flex items-center gap-1.5">→ السابق</Link>
            : <span />}
          <span className="text-xs text-gray-500">صفحة {page} من {totalPages} · {totalEntries} حديث</span>
          {page < totalPages
            ? <Link href={`/musnad-musannaf/${companion.slug}?page=${page + 1}`} className="ui-card !py-2 !px-4 text-sm text-gray-700 hover:text-green-800 flex items-center gap-1.5">التالي ←</Link>
            : <span />}
        </nav>
      )}
    </div>
  )
}
