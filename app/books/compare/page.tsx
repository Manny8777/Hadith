import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Book {
  id: number; title: string; takhrij_author: string | null; takhrij_death: number | null
  total_hadiths: number; fame: number | null
}
interface BookStat {
  sahih: number; hasan: number; daif: number
  avg_chain_length: number | null
  companion_count: number
  top_companion: string | null
  chapter_count: number
  shared_hadiths: number
}
interface CompanionRow { name: string; cnt: number }
interface DepthRow { chain_length: number; cnt: number }

async function getBookInfo(id: number): Promise<Book | null> {
  const res = await pool.query<Book>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame,
            COUNT(h.main_id)::int AS total_hadiths
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
     WHERE b.id = $1
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame`,
    [id]
  )
  return res.rows[0] || null
}

async function getBookStats(id: number): Promise<BookStat> {
  const [gradeRes, chainRes, companionRes, chapterRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(DISTINCT CASE WHEN hj.grade_class = 'صحيح' THEN hj.hadith_id END)::int AS sahih,
         COUNT(DISTINCT CASE WHEN hj.grade_class = 'حسن' THEN hj.hadith_id END)::int AS hasan,
         COUNT(DISTINCT CASE WHEN hj.grade_class = 'ضعيف' THEN hj.hadith_id END)::int AS daif
       FROM hadith_toc ht
       JOIN (
         SELECT hadith_id,
           CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           END AS grade_class
         FROM hadith_judgments
         WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
       ) hj ON hj.hadith_id = ht.main_id
       WHERE ht.book_id = $1 AND hj.grade_class IS NOT NULL`,
      [id]
    ).catch(() => ({ rows: [{ sahih: 0, hasan: 0, daif: 0 }] })),
    pool.query(
      `SELECT ROUND(AVG(ic.chain_length))::int AS avg_chain_length
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE ht.book_id = $1 AND ic.chain_length IS NOT NULL`,
      [id]
    ).catch(() => ({ rows: [{ avg_chain_length: null }] })),
    pool.query<CompanionRow>(
      `SELECT n.name, COUNT(DISTINCT ht.main_id)::int AS cnt
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN narrators n ON n.id = ic.narrator_id_array[1]
       WHERE ht.book_id = $1 AND n.is_companion = true
       GROUP BY n.name
       ORDER BY cnt DESC`,
      [id]
    ).catch(() => ({ rows: [] })),
    pool.query(
      `SELECT COUNT(DISTINCT chapter_text)::int AS chapter_count
       FROM hadith_toc
       WHERE book_id = $1 AND chapter_text IS NOT NULL AND chapter_text <> ''`,
      [id]
    ).catch(() => ({ rows: [{ chapter_count: 0 }] })),
  ])

  return {
    sahih: gradeRes.rows[0]?.sahih || 0,
    hasan: gradeRes.rows[0]?.hasan || 0,
    daif: gradeRes.rows[0]?.daif || 0,
    avg_chain_length: chainRes.rows[0]?.avg_chain_length ?? null,
    companion_count: companionRes.rows.length,
    top_companion: companionRes.rows[0]?.name || null,
    chapter_count: chapterRes.rows[0]?.chapter_count || 0,
    shared_hadiths: 0,
  }
}

export default async function BooksComparePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string }>
}) {
  const sp = await searchParams
  const idA = parseInt(sp.a || '')
  const idB = parseInt(sp.b || '')

  // Load all books for selector
  const booksRes = await pool.query<Book>(
    `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame,
            COUNT(h.main_id)::int AS total_hadiths
     FROM books b
     LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
     GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame
     ORDER BY b.tarteeb, b.id`
  )
  const allBooks = booksRes.rows

  let bookA: Book | null = null
  let bookB: Book | null = null
  let statsA: BookStat | null = null
  let statsB: BookStat | null = null
  let sharedCount = 0
  let depthA: DepthRow[] = []
  let depthB: DepthRow[] = []
  let companionsA: CompanionRow[] = []
  let companionsB: CompanionRow[] = []

  if (!isNaN(idA) && !isNaN(idB) && idA !== idB) {
    const [bA, bB, sA, sB, shared, dA, dB, cA, cB] = await Promise.all([
      getBookInfo(idA),
      getBookInfo(idB),
      getBookStats(idA),
      getBookStats(idB),
      pool.query(
        `SELECT COUNT(DISTINCT t_a.group_id)::int AS cnt
         FROM takhrij t_a
         JOIN takhrij t_b ON t_b.group_id = t_a.group_id AND t_b.book_id = $2
         WHERE t_a.book_id = $1`,
        [idA, idB]
      ).catch(() => ({ rows: [{ cnt: 0 }] })),
      pool.query<DepthRow>(
        `SELECT ic.chain_length, COUNT(DISTINCT ih.hadith_id)::int AS cnt
         FROM hadith_toc ht
         JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         WHERE ht.book_id = $1 AND ic.chain_length IS NOT NULL
         GROUP BY ic.chain_length ORDER BY ic.chain_length`,
        [idA]
      ).catch(() => ({ rows: [] })),
      pool.query<DepthRow>(
        `SELECT ic.chain_length, COUNT(DISTINCT ih.hadith_id)::int AS cnt
         FROM hadith_toc ht
         JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         WHERE ht.book_id = $1 AND ic.chain_length IS NOT NULL
         GROUP BY ic.chain_length ORDER BY ic.chain_length`,
        [idB]
      ).catch(() => ({ rows: [] })),
      pool.query<CompanionRow>(
        `SELECT n.name, COUNT(DISTINCT ht.main_id)::int AS cnt
         FROM hadith_toc ht JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN narrators n ON n.id = ic.narrator_id_array[1]
         WHERE ht.book_id = $1 AND n.is_companion = true
         GROUP BY n.name ORDER BY cnt DESC LIMIT 12`,
        [idA]
      ).catch(() => ({ rows: [] })),
      pool.query<CompanionRow>(
        `SELECT n.name, COUNT(DISTINCT ht.main_id)::int AS cnt
         FROM hadith_toc ht JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN narrators n ON n.id = ic.narrator_id_array[1]
         WHERE ht.book_id = $1 AND n.is_companion = true
         GROUP BY n.name ORDER BY cnt DESC LIMIT 12`,
        [idB]
      ).catch(() => ({ rows: [] })),
    ])
    bookA = bA; bookB = bB; statsA = sA; statsB = sB
    sharedCount = shared.rows[0]?.cnt || 0
    depthA = dA.rows; depthB = dB.rows
    companionsA = cA.rows; companionsB = cB.rows
  }

  const hasBoth = bookA && bookB && statsA && statsB

  // Get all depths for unified scale
  const allDepths = new Set<number>([...depthA.map(d => d.chain_length), ...depthB.map(d => d.chain_length)])
  const depthMap = (rows: DepthRow[]) => Object.fromEntries(rows.map(d => [d.chain_length, d.cnt]))

  function maxVal(...vals: number[]) { return Math.max(1, ...vals) }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/books" className="text-sm text-green-700 hover:underline">← الكتب</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">مقارنة الكتب</h1>
        <p className="text-sm text-gray-500">مقارنة منهجية بين كتابَين حديثيَّين — درجات الأسانيد، أطوالها، مصادر الصحابة</p>
      </div>

      {/* Book selectors */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
        <form method="GET" action="/books/compare" className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الكتاب الأول</label>
            <select name="a" defaultValue={sp.a || ''}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-green-400" dir="rtl">
              <option value="">-- اختر --</option>
              {allBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">الكتاب الثاني</label>
            <select name="b" defaultValue={sp.b || ''}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-green-400" dir="rtl">
              <option value="">-- اختر --</option>
              {allBooks.map(b => <option key={b.id} value={b.id}>{b.title}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <button type="submit"
              className="px-6 py-2.5 bg-green-700 text-white text-sm font-medium rounded-xl hover:bg-green-800 transition-colors">
              مقارنة
            </button>
          </div>
        </form>
      </div>

      {hasBoth && (
        <div className="space-y-6">
          {/* Header comparison */}
          <div className="grid grid-cols-2 gap-4">
            {([
              { book: bookA!, stats: statsA!, color: 'border-blue-200 bg-blue-50', badge: 'bg-blue-700' },
              { book: bookB!, stats: statsB!, color: 'border-purple-200 bg-purple-50', badge: 'bg-purple-700' },
            ] as const).map(({ book, stats, color, badge }) => (
              <div key={book.id} className={`rounded-2xl border p-5 ${color}`}>
                <Link href={`/books/${book.id}`} className="font-bold text-green-900 text-base hover:underline block mb-1 leading-snug">
                  {book.title}
                </Link>
                {book.takhrij_author && (
                  <p className="text-xs text-gray-500 mb-2">{book.takhrij_author}{book.takhrij_death ? ` (ت.${book.takhrij_death})` : ''}</p>
                )}
                <div className="text-2xl font-bold text-green-800">{book.total_hadiths.toLocaleString('ar-EG')}</div>
                <div className="text-xs text-gray-500">حديث</div>
              </div>
            ))}
          </div>

          {/* Shared hadiths */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5 text-center">
            <div className="text-3xl font-bold text-green-700 mb-1">{sharedCount.toLocaleString('ar-EG')}</div>
            <div className="text-sm text-gray-600 mb-2">حديث مشترك عبر التخريج</div>
            <Link href={`/books/intersection?a=${idA}&b=${idB}&mode=intersection`}
              className="text-xs text-green-700 hover:underline border border-green-200 bg-green-50 px-3 py-1.5 rounded-lg">
              استعرض المشترك →
            </Link>
          </div>

          {/* Grade comparison */}
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h2 className="font-bold text-green-900 mb-4">مقارنة درجات الأسانيد</h2>
            {(['صحيح', 'حسن', 'ضعيف'] as const).map(grade => {
              const vA = grade === 'صحيح' ? statsA!.sahih : grade === 'حسن' ? statsA!.hasan : statsA!.daif
              const vB = grade === 'صحيح' ? statsB!.sahih : grade === 'حسن' ? statsB!.hasan : statsB!.daif
              const mx = maxVal(vA, vB)
              const colorClass = grade === 'صحيح' ? 'bg-green-500' : grade === 'حسن' ? 'bg-amber-400' : 'bg-red-400'
              const textClass = grade === 'صحيح' ? 'text-green-700' : grade === 'حسن' ? 'text-amber-700' : 'text-red-600'
              return (
                <div key={grade} className="mb-4">
                  <div className="text-sm font-medium text-gray-700 mb-2">{grade}</div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs ${textClass} w-12 text-left tabular-nums shrink-0`}>{vA.toLocaleString('ar-EG')}</span>
                    <div className="flex-1 flex items-center gap-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${colorClass} rounded-full`} style={{ width: `${Math.round(vA/mx*100)}%` }} />
                      </div>
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full ${colorClass} rounded-full opacity-60`} style={{ width: `${Math.round(vB/mx*100)}%` }} />
                      </div>
                    </div>
                    <span className={`text-xs ${textClass} w-12 text-right tabular-nums shrink-0`}>{vB.toLocaleString('ar-EG')}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Chain depth comparison */}
          {(depthA.length > 0 || depthB.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-green-900 mb-4">مقارنة أطوال الأسانيد</h2>
              <div className="flex items-center gap-4 text-xs text-gray-400 mb-3">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-blue-400 rounded inline-block"></span>{bookA!.title}</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 bg-purple-400 rounded inline-block opacity-60"></span>{bookB!.title}</span>
              </div>
              <div className="space-y-2">
                {Array.from(allDepths).sort((a, b) => a - b).map(depth => {
                  const mapA = depthMap(depthA)
                  const mapB = depthMap(depthB)
                  const vA = mapA[depth] || 0
                  const vB = mapB[depth] || 0
                  const mx = maxVal(vA, vB)
                  return (
                    <div key={depth} className="flex items-center gap-3">
                      <span className="text-xs text-gray-500 w-8 text-left">{depth}</span>
                      <div className="flex-1 flex items-center gap-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round(vA/mx*100)}%` }} />
                        </div>
                        <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-purple-400 rounded-full opacity-60" style={{ width: `${Math.round(vB/mx*100)}%` }} />
                        </div>
                      </div>
                      <div className="flex gap-3 text-xs tabular-nums shrink-0">
                        <span className="text-blue-600 w-12 text-left">{vA.toLocaleString('ar-EG')}</span>
                        <span className="text-purple-600 w-12 text-left">{vB.toLocaleString('ar-EG')}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-4 text-center text-sm bg-gray-50 rounded-xl p-3">
                <div>
                  <div className="font-bold text-blue-700">{statsA!.avg_chain_length ?? '—'}</div>
                  <div className="text-xs text-gray-400">متوسط طول السند ({bookA!.title})</div>
                </div>
                <div>
                  <div className="font-bold text-purple-700">{statsB!.avg_chain_length ?? '—'}</div>
                  <div className="text-xs text-gray-400">متوسط طول السند ({bookB!.title})</div>
                </div>
              </div>
            </div>
          )}

          {/* Top companions comparison */}
          {(companionsA.length > 0 || companionsB.length > 0) && (
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h2 className="font-bold text-green-900 mb-4">أبرز الصحابة في كل كتاب (أعلى 12)</h2>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-semibold text-blue-700 mb-2">{bookA!.title}</h3>
                  <div className="space-y-1.5">
                    {companionsA.map((c, i) => {
                      const pct = companionsA[0]?.cnt > 0 ? Math.round(c.cnt / companionsA[0].cnt * 100) : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4 shrink-0">{i+1}</span>
                          <span className="text-xs text-gray-700 flex-1 truncate">{c.name}</span>
                          <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden shrink-0">
                            <div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-left tabular-nums shrink-0">{c.cnt}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-purple-700 mb-2">{bookB!.title}</h3>
                  <div className="space-y-1.5">
                    {companionsB.map((c, i) => {
                      const pct = companionsB[0]?.cnt > 0 ? Math.round(c.cnt / companionsB[0].cnt * 100) : 0
                      return (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 w-4 shrink-0">{i+1}</span>
                          <span className="text-xs text-gray-700 flex-1 truncate">{c.name}</span>
                          <div className="w-16 bg-gray-100 rounded-full h-1.5 overflow-hidden shrink-0">
                            <div className="h-full bg-purple-400 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-gray-400 w-10 text-left tabular-nums shrink-0">{c.cnt}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick actions */}
          <div className="flex flex-wrap gap-3">
            <Link href={`/books/intersection?a=${idA}&b=${idB}&mode=intersection`}
              className="px-4 py-2 text-sm bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors">
              المشترك بين الكتابَين
            </Link>
            <Link href={`/books/intersection?a=${idA}&b=${idB}&mode=unique_a`}
              className="px-4 py-2 text-sm bg-amber-600 text-white rounded-xl hover:bg-amber-700 transition-colors">
              منفردات {bookA!.title}
            </Link>
            <Link href={`/books/${idA}/analysis`}
              className="px-4 py-2 text-sm bg-white border border-blue-200 text-blue-800 rounded-xl hover:border-blue-400 transition-colors">
              تحليل {bookA!.title}
            </Link>
            <Link href={`/books/${idB}/analysis`}
              className="px-4 py-2 text-sm bg-white border border-purple-200 text-purple-800 rounded-xl hover:border-purple-400 transition-colors">
              تحليل {bookB!.title}
            </Link>
          </div>
        </div>
      )}
    </div>
  )
}
