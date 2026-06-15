export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import HadithNumSearch from '@/app/components/HadithNumSearch'
import HadithNumber from '@/app/components/HadithNumber'

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function chapterLabel(row: { content: string | null; chapter_text: string | null; section_text: string | null }): string {
  return stripTags(row.content || '') || row.chapter_text?.trim() || row.section_text?.trim() || '—'
}

export default async function BookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ section?: string; page?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const bookId = parseInt(id)
  const sectionId = sp.section ? parseInt(sp.section) : null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const LIMIT = 50
  const offset = (page - 1) * LIMIT

  const [bookRes, rootRes] = await Promise.all([
    pool.query('SELECT * FROM books WHERE id = $1', [bookId]),
    pool.query(
      `SELECT main_id FROM hadith_toc WHERE book_id = $1 AND (parent_id = 0 OR parent_id IS NULL) LIMIT 1`,
      [bookId]
    ),
  ])

  if (!bookRes.rows[0]) notFound()
  const book = bookRes.rows[0]
  const rootId: number | null = rootRes.rows[0]?.main_id ?? null

  // Helper to build hrefs
  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const p: Record<string, string> = { }
    if (sectionId) p.section = String(sectionId)
    if (page > 1) p.page = String(page)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== undefined) p[k] = String(v)
      else delete p[k]
    })
    const qs = new URLSearchParams(p).toString()
    return `/books/${bookId}${qs ? '?' + qs : ''}`
  }

  if (sectionId !== null) {
    // ── Section view: show sub-chapters + paginated hadiths ──
    const [sectionRes, subChapRes, hadithsRes, countRes] = await Promise.all([
      // The section node itself (for breadcrumb)
      pool.query(
        `SELECT main_id, parent_id, content, chapter_text, section_text, left_value, right_value
         FROM hadith_toc WHERE main_id = $1`,
        [sectionId]
      ),
      // Direct non-leaf children (sub-chapters)
      pool.query(
        `SELECT main_id, content, chapter_text, section_text, left_value, right_value,
                (SELECT COUNT(*) FROM hadith_toc
                 WHERE book_id = $2 AND is_leaf = true AND is_paragraph = true
                   AND left_value > t.left_value AND left_value < t.right_value) AS hadith_count
         FROM hadith_toc t
         WHERE book_id = $2 AND parent_id = $1 AND is_leaf = false
         ORDER BY left_value`,
        [sectionId, bookId]
      ),
      // Paginated leaf hadiths in this section
      pool.query(
        `SELECT main_id, tarf, content, section_text, chapter_text, part_num, page_num,
                tarqeem_harf, tarqeem_matboa1
         FROM hadith_toc t
         WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true
           AND t.left_value > (SELECT left_value FROM hadith_toc WHERE main_id = $2)
           AND t.left_value < (SELECT right_value FROM hadith_toc WHERE main_id = $2)
         ORDER BY t.left_value
         LIMIT $3 OFFSET $4`,
        [bookId, sectionId, LIMIT, offset]
      ),
      // Total count of hadiths in this section
      pool.query(
        `SELECT COUNT(*) FROM hadith_toc t
         WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true
           AND t.left_value > (SELECT left_value FROM hadith_toc WHERE main_id = $2)
           AND t.left_value < (SELECT right_value FROM hadith_toc WHERE main_id = $2)`,
        [bookId, sectionId]
      ),
    ])

    const section = sectionRes.rows[0]
    if (!section) notFound()
    const subChapters = subChapRes.rows
    const hadiths = hadithsRes.rows
    const total = parseInt(countRes.rows[0]?.count || '0')
    const totalPages = Math.ceil(total / LIMIT)

    // Breadcrumb: walk up the parent chain
    const crumbs: Array<{ id: number; label: string }> = []
    let curId = section.parent_id
    while (curId && curId !== rootId) {
      const res = await pool.query(
        `SELECT main_id, parent_id, content, chapter_text, section_text FROM hadith_toc WHERE main_id = $1`,
        [curId]
      )
      if (!res.rows[0]) break
      crumbs.unshift({ id: res.rows[0].main_id, label: chapterLabel(res.rows[0]) })
      curId = res.rows[0].parent_id
    }

    return (
      <div dir="rtl" className="min-h-screen bg-amber-50">
        <header className="bg-green-900 text-white shadow-lg">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <Link href="/books" className="text-amber-300 hover:text-amber-100">الكتب</Link>
              <span className="text-white/30">›</span>
              <Link href={`/books/${bookId}`} className="text-amber-300 hover:text-amber-100 truncate max-w-48">{book.title}</Link>
              {crumbs.map(c => (
                <>
                  <span key={`sep-${c.id}`} className="text-white/30">›</span>
                  <Link key={c.id} href={`/books/${bookId}?section=${c.id}`} className="text-amber-300 hover:text-amber-100 truncate max-w-32">
                    {c.label}
                  </Link>
                </>
              ))}
              <span className="text-white/30">›</span>
              <span className="text-white/70 truncate max-w-40">{chapterLabel(section)}</span>
            </div>
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-4 py-6">
          <h2 className="text-xl font-bold text-green-900 mb-5">{chapterLabel(section)}</h2>

          {/* Sub-chapters */}
          {subChapters.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 mb-3">الأبواب الفرعية</h3>
              <div className="grid sm:grid-cols-2 gap-2">
                {subChapters.map(ch => (
                  <Link
                    key={ch.main_id}
                    href={`/books/${bookId}?section=${ch.main_id}`}
                    className="bg-white border border-gray-100 hover:border-green-300 rounded-xl px-4 py-3 flex items-center justify-between group transition-all"
                  >
                    <span className="text-sm text-green-900 group-hover:text-green-700 font-medium leading-snug">
                      {chapterLabel(ch)}
                    </span>
                    {parseInt(ch.hadith_count) > 0 && (
                      <span className="text-xs text-gray-400 shrink-0 mr-2">{parseInt(ch.hadith_count).toLocaleString('ar-EG')}</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Hadiths */}
          {hadiths.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-500">
                  الأحاديث
                  {total > 0 && <span className="text-gray-400 font-normal mr-2">({total.toLocaleString('ar-EG')})</span>}
                </h3>
                {totalPages > 1 && (
                  <span className="text-xs text-gray-400">صفحة {page} من {totalPages}</span>
                )}
              </div>
              <div className="space-y-2">
                {hadiths.map(h => (
                  <Link
                    key={h.main_id}
                    href={`/hadith/${h.main_id}`}
                    className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-sm hover:border-green-200 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p className="text-gray-800 text-sm leading-relaxed line-clamp-3 flex-1">
                        {stripTags(h.tarf || h.content).slice(0, 250)}
                      </p>
                      <div className="shrink-0 text-xs text-gray-400 text-left whitespace-nowrap">
                        <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                        {(h.part_num > 0 || h.page_num > 0) && <div>ج{h.part_num} ص{h.page_num}</div>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                  {page > 1 && (
                    <Link href={buildHref({ page: page - 1 })}
                      className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                      السابق
                    </Link>
                  )}
                  {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                    let pg: number
                    if (totalPages <= 7) pg = i + 1
                    else if (page <= 4) pg = i + 1
                    else if (page >= totalPages - 3) pg = totalPages - 6 + i
                    else pg = page - 3 + i
                    return (
                      <Link key={pg} href={buildHref({ page: pg })}
                        className={`px-4 py-2 rounded-lg border text-sm ${pg === page ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'}`}>
                        {pg.toLocaleString('ar-EG')}
                      </Link>
                    )
                  })}
                  {page < totalPages && (
                    <Link href={buildHref({ page: page + 1 })}
                      className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                      التالي
                    </Link>
                  )}
                </div>
              )}
            </div>
          )}

          {subChapters.length === 0 && hadiths.length === 0 && (
            <p className="text-gray-400 text-center py-12">لا توجد أحاديث في هذا الباب</p>
          )}
        </main>
      </div>
    )
  }

  // ── Book overview: show top-level chapters ──
  const [topChapRes, sampleRes, statsRes, companionsRes, gradeRes] = await Promise.all([
    // Top-level chapters (direct children of root)
    rootId ? pool.query(
      `SELECT main_id, content, chapter_text, section_text, left_value, right_value,
              (SELECT COUNT(*) FROM hadith_toc
               WHERE book_id = $2 AND is_leaf = true AND is_paragraph = true
                 AND left_value > t.left_value AND left_value < t.right_value) AS hadith_count
       FROM hadith_toc t
       WHERE book_id = $2 AND parent_id = $1 AND is_leaf = false
       ORDER BY left_value
       LIMIT 200`,
      [rootId, bookId]
    ) : pool.query(
      `SELECT main_id, content, chapter_text, section_text, left_value, right_value, 0 as hadith_count
       FROM hadith_toc WHERE book_id = $1 AND is_leaf = false ORDER BY left_value LIMIT 100`,
      [bookId]
    ),
    // First few hadiths as a preview
    pool.query(
      `SELECT main_id, tarf, content, part_num, page_num, tarqeem_harf
       FROM hadith_toc WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true
       ORDER BY left_value LIMIT 5`,
      [bookId]
    ),
    // Stats
    pool.query(
      `SELECT COUNT(*) as total_hadiths FROM hadith_toc WHERE book_id = $1 AND is_leaf = true AND is_paragraph = true`,
      [bookId]
    ),
    // Top companions in this book (from chain position 1)
    pool.query(
      `SELECT n.id, n.name, n.abb_name, COUNT(DISTINCT ht.main_id)::int AS cnt
       FROM hadith_toc ht
       JOIN narrators n ON n.id = ht.narrator_id_array[1] AND n.is_companion = true
       WHERE ht.book_id = $1 AND ht.is_leaf = true
       GROUP BY n.id, n.name, n.abb_name
       ORDER BY cnt DESC
       LIMIT 12`,
      [bookId]
    ).catch(() => ({ rows: [] })),
    // Grade/authenticity breakdown for hadiths in this book
    pool.query(
      `SELECT
         CASE
           WHEN j.say_text ~* 'صحيح' AND j.say_text !~* 'ضعيف|ليس بصحيح' THEN 'صحيح'
           WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'ضعيف' THEN 'حسن'
           WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع|لا يصح|باطل' THEN 'ضعيف'
           ELSE 'غير محدد'
         END AS grade,
         COUNT(DISTINCT ht.main_id) AS cnt
       FROM hadith_toc ht
       LEFT JOIN hadith_judgments j ON j.hadith_id = ht.main_id
       WHERE ht.book_id = $1 AND ht.is_leaf = true AND ht.is_paragraph = true
       GROUP BY 1
       ORDER BY cnt DESC`,
      [bookId]
    ).catch(() => ({ rows: [] })),
  ])

  const topChapters = topChapRes.rows
  const sampleHadiths = sampleRes.rows
  const totalHadiths = parseInt(statsRes.rows[0]?.total_hadiths || '0')
  const topCompanions = (companionsRes as { rows: Array<{ id: number; name: string; abb_name: string | null; cnt: number }> }).rows
  const maxCompanionCnt = topCompanions[0]?.cnt || 1

  // Grade breakdown
  type GradeRow = { grade: string; cnt: string }
  const gradeRows = (gradeRes as { rows: GradeRow[] }).rows
  const gradeCounts = { صحيح: 0, حسن: 0, ضعيف: 0, 'غير محدد': 0 }
  for (const r of gradeRows) {
    const g = r.grade as keyof typeof gradeCounts
    if (g in gradeCounts) gradeCounts[g] = parseInt(r.cnt)
  }
  const gradeTotalJudged = gradeCounts['صحيح'] + gradeCounts['حسن'] + gradeCounts['ضعيف'] + gradeCounts['غير محدد']
  const gradePct = (key: keyof typeof gradeCounts) =>
    gradeTotalJudged > 0 ? Math.round((gradeCounts[key] / gradeTotalJudged) * 100) : 0
  const hasGradeData = gradeTotalJudged > 0

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center gap-2 text-sm mb-3">
            <Link href="/books" className="text-amber-300 hover:text-amber-100">← الكتب</Link>
          </div>
          <h1 className="text-xl font-bold text-amber-100 leading-snug">{book.title}</h1>
          {book.takhrij_author && (
            <p className="text-amber-200/70 text-sm mt-1">
              {book.author_id ? (
                <Link href={`/authors/${book.author_id}`} className="hover:text-amber-100 transition-colors">
                  {book.takhrij_author}
                </Link>
              ) : book.takhrij_author}
              {book.takhrij_death ? ` (ت ${book.takhrij_death} هـ)` : ''}
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-amber-200/60">
            <span>{totalHadiths.toLocaleString('ar-EG')} حديث</span>
            {topChapters.length > 0 && <span>{topChapters.length} باب</span>}
            <Link href={`/books/${bookId}/narrators`} className="text-amber-300 hover:text-amber-100 transition-colors">
              رواة الكتاب ←
            </Link>
          </div>
          {/* Quick hadith number lookup */}
          <div className="mt-3">
            <HadithNumSearch bookId={bookId} />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">

        {/* Quick search within this book */}
        <div className="mb-6 flex gap-3">
          <Link
            href={`/search?book_id=${bookId}`}
            className="text-sm bg-green-50 text-green-800 border border-green-200 rounded-xl px-4 py-2 hover:bg-green-100 transition-colors"
          >
            بحث في هذا الكتاب
          </Link>
          <Link
            href={`/books/${bookId}/narrators`}
            className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-2 hover:bg-amber-100 transition-colors"
          >
            رجال الكتاب
          </Link>
          <Link
            href={`/chains?book=${bookId}`}
            className="text-sm bg-blue-50 text-blue-800 border border-blue-200 rounded-xl px-4 py-2 hover:bg-blue-100 transition-colors"
          >
            علو الإسناد
          </Link>
          <Link
            href={`/books/${bookId}/analysis`}
            className="text-sm bg-purple-50 text-purple-800 border border-purple-200 rounded-xl px-4 py-2 hover:bg-purple-100 transition-colors"
          >
            تحليل الكتاب
          </Link>
          <Link
            href={`/books/${bookId}/mashyakha`}
            className="text-sm bg-amber-50 text-amber-800 border border-amber-200 rounded-xl px-4 py-2 hover:bg-amber-100 transition-colors"
          >
            المشيخة
          </Link>
          <Link
            href={`/books/${bookId}/isnad-profile`}
            className="text-sm bg-indigo-50 text-indigo-800 border border-indigo-200 rounded-xl px-4 py-2 hover:bg-indigo-100 transition-colors"
          >
            ملف الإسناد
          </Link>
        </div>

        {/* Top companions in this book */}
        {topCompanions.length > 0 && (
          <div className="mb-6 bg-white rounded-2xl border border-amber-100 p-5">
            <h2 className="text-sm font-bold text-amber-900 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-amber-500 rounded-full inline-block"></span>
              أبرز الصحابة في أسانيد هذا الكتاب
            </h2>
            <div className="space-y-1.5">
              {topCompanions.slice(0, 8).map(c => (
                <div key={c.id} className="flex items-center gap-2">
                  <Link
                    href={`/narrator/${c.id}`}
                    className="text-xs text-amber-800 hover:underline shrink-0 w-32 text-right truncate"
                  >
                    {c.abb_name || c.name.split('،')[0].trim()}
                  </Link>
                  <div className="flex-1 bg-amber-50 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-amber-400 h-2 rounded-full"
                      style={{ width: `${Math.round((c.cnt / maxCompanionCnt) * 100)}%` }}
                    />
                  </div>
                  <Link
                    href={`/search?narrator_id=${c.id}&narrator_name=${encodeURIComponent(c.abb_name || c.name)}`}
                    className="text-xs text-gray-400 hover:text-green-700 shrink-0 w-14 text-left"
                    title="بحث في أحاديث هذا الصحابي"
                  >
                    {c.cnt.toLocaleString('ar-EG')} ←
                  </Link>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Grade / authenticity profile */}
        {hasGradeData && (
          <div className="mb-6 bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="text-sm font-bold text-gray-700 mb-3 flex items-center gap-2">
              <span className="w-1 h-4 bg-green-500 rounded-full inline-block"></span>
              جودة الأسانيد
            </h2>
            {/* Stacked bar */}
            <div className="flex h-4 rounded-full overflow-hidden w-full mb-3">
              {gradeCounts['صحيح'] > 0 && (
                <div
                  className="bg-green-500 h-full transition-all"
                  style={{ width: `${gradePct('صحيح')}%` }}
                  title={`صحيح: ${gradeCounts['صحيح'].toLocaleString('ar-EG')}`}
                />
              )}
              {gradeCounts['حسن'] > 0 && (
                <div
                  className="bg-amber-400 h-full transition-all"
                  style={{ width: `${gradePct('حسن')}%` }}
                  title={`حسن: ${gradeCounts['حسن'].toLocaleString('ar-EG')}`}
                />
              )}
              {gradeCounts['ضعيف'] > 0 && (
                <div
                  className="bg-red-400 h-full transition-all"
                  style={{ width: `${gradePct('ضعيف')}%` }}
                  title={`ضعيف: ${gradeCounts['ضعيف'].toLocaleString('ar-EG')}`}
                />
              )}
              {gradeCounts['غير محدد'] > 0 && (
                <div
                  className="bg-gray-200 h-full flex-1 transition-all"
                  style={{ width: `${gradePct('غير محدد')}%` }}
                  title={`غير محدد: ${gradeCounts['غير محدد'].toLocaleString('ar-EG')}`}
                />
              )}
            </div>
            {/* Legend + counts */}
            <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
              {gradeCounts['صحيح'] > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block shrink-0"></span>
                  <span className="text-gray-600">صحيح</span>
                  <span className="font-semibold text-green-700">{gradeCounts['صحيح'].toLocaleString('ar-EG')}</span>
                  <span className="text-gray-400">({gradePct('صحيح')}٪)</span>
                </div>
              )}
              {gradeCounts['حسن'] > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block shrink-0"></span>
                  <span className="text-gray-600">حسن</span>
                  <span className="font-semibold text-amber-700">{gradeCounts['حسن'].toLocaleString('ar-EG')}</span>
                  <span className="text-gray-400">({gradePct('حسن')}٪)</span>
                </div>
              )}
              {gradeCounts['ضعيف'] > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block shrink-0"></span>
                  <span className="text-gray-600">ضعيف</span>
                  <span className="font-semibold text-red-700">{gradeCounts['ضعيف'].toLocaleString('ar-EG')}</span>
                  <span className="text-gray-400">({gradePct('ضعيف')}٪)</span>
                </div>
              )}
              {gradeCounts['غير محدد'] > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block shrink-0"></span>
                  <span className="text-gray-500">غير محدد</span>
                  <span className="font-semibold text-gray-500">{gradeCounts['غير محدد'].toLocaleString('ar-EG')}</span>
                  <span className="text-gray-400">({gradePct('غير محدد')}٪)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Book summary */}
        {book.summary?.trim() && (
          <details className="mb-8 bg-white rounded-2xl border border-amber-100 group">
            <summary className="px-6 py-4 cursor-pointer flex items-center justify-between list-none">
              <h2 className="text-base font-bold text-amber-900 flex items-center gap-2">
                <span className="w-1 h-4 bg-amber-500 rounded-full inline-block"></span>
                منهج الكتاب ووصفه
              </h2>
              <span className="text-xs text-gray-400 group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-6 pb-6 pt-2 text-sm text-gray-800 leading-8 whitespace-pre-line">
              {stripTags(book.summary).slice(0, 3000)}
              {stripTags(book.summary).length > 3000 && '...'}
            </div>
          </details>
        )}

        {/* Chapters */}
        {topChapters.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-amber-500 rounded-full inline-block"></span>
              فهرس الكتاب
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {topChapters.map(ch => (
                <Link
                  key={ch.main_id}
                  href={`/books/${bookId}?section=${ch.main_id}`}
                  className="bg-white border border-gray-100 hover:border-green-300 hover:shadow-sm rounded-xl px-4 py-3.5 flex items-center justify-between group transition-all"
                >
                  <span className="text-sm text-green-900 group-hover:text-green-700 font-medium leading-snug">
                    {chapterLabel(ch)}
                  </span>
                  {parseInt(ch.hadith_count) > 0 && (
                    <span className="text-xs text-gray-400 shrink-0 mr-2 bg-gray-50 px-2 py-0.5 rounded-full">
                      {parseInt(ch.hadith_count).toLocaleString('ar-EG')}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Sample hadiths preview */}
        {sampleHadiths.length > 0 && (
          <div>
            <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-5 bg-green-500 rounded-full inline-block"></span>
              نموذج من الأحاديث
            </h2>
            <div className="space-y-2">
              {sampleHadiths.map(h => (
                <Link
                  key={h.main_id}
                  href={`/hadith/${h.main_id}`}
                  className="block bg-white rounded-xl border border-gray-100 px-5 py-4 hover:shadow-sm hover:border-green-200 transition-all"
                >
                  <div className="flex items-start justify-between gap-4">
                    <p className="text-gray-800 text-sm leading-relaxed line-clamp-2 flex-1">
                      {stripTags(h.tarf || h.content).slice(0, 200)}
                    </p>
                    <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {topChapters.length === 0 && sampleHadiths.length === 0 && (
          <p className="text-gray-400 text-center py-16">لا توجد بيانات لهذا الكتاب</p>
        )}
      </main>
    </div>
  )
}
