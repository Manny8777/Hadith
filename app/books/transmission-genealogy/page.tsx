import pool from '@/lib/db'
import Link from 'next/link'
import NavigateSelect from '@/app/components/NavigateSelect'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تداخل الكتب وتشعب الأسانيد — جامع خادم الحرمين' }

interface BookPairRow {
  book1_id: number
  book1_name: string
  book2_id: number
  book2_name: string
  shared_hadiths: number
  book1_total: number
  book2_total: number
  overlap_pct_1: number
  overlap_pct_2: number
}

interface BookStat {
  id: number
  name: string
  hadith_count: number
  takhrij_count: number
  unique_count: number
  unique_pct: number
}

export default async function TransmissionGenealogyPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; min_shared?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const minShared = Math.max(1, parseInt(sp.min_shared || '10'))

  const [bookStatsRes, pairsRes, relatedRes] = await Promise.all([
    // Book stats: total hadiths, via takhrij_id, unique ones
    pool.query<BookStat>(
      `SELECT
         b.id,
         b.title AS name,
         COUNT(DISTINCT ht.main_id)::int AS hadith_count,
         COUNT(DISTINCT ht.takhrij_id) FILTER (WHERE ht.takhrij_id IS NOT NULL)::int AS takhrij_count,
         COUNT(DISTINCT ht.main_id) FILTER (WHERE ht.takhrij_id IS NULL)::int AS unique_count,
         CASE WHEN COUNT(DISTINCT ht.main_id) > 0
              THEN ROUND(COUNT(DISTINCT ht.main_id) FILTER (WHERE ht.takhrij_id IS NULL) * 100.0
                        / COUNT(DISTINCT ht.main_id), 1)
              ELSE 0 END AS unique_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       GROUP BY b.id, b.title
       ORDER BY hadith_count DESC
       LIMIT 50`
    ).catch(() => ({ rows: [] as BookStat[] })),

    // Book overlap pairs
    pool.query<BookPairRow>(
      `WITH book_hadith_sets AS (
         SELECT b.id AS book_id, b.title AS book_name,
                ht.takhrij_id
         FROM books b
         JOIN hadith_toc ht ON ht.book_id = b.id
         WHERE ht.takhrij_id IS NOT NULL
       ),
       book_sizes AS (
         SELECT book_id, COUNT(DISTINCT takhrij_id)::int AS sz
         FROM book_hadith_sets
         GROUP BY book_id
       )
       SELECT
         b1.book_id AS book1_id,
         b1.book_name AS book1_name,
         b2.book_id AS book2_id,
         b2.book_name AS book2_name,
         COUNT(DISTINCT b1.takhrij_id)::int AS shared_hadiths,
         sz1.sz AS book1_total,
         sz2.sz AS book2_total,
         ROUND(COUNT(DISTINCT b1.takhrij_id) * 100.0 / NULLIF(sz1.sz, 0), 1)::float AS overlap_pct_1,
         ROUND(COUNT(DISTINCT b1.takhrij_id) * 100.0 / NULLIF(sz2.sz, 0), 1)::float AS overlap_pct_2
       FROM book_hadith_sets b1
       JOIN book_hadith_sets b2 ON b2.takhrij_id = b1.takhrij_id
         AND b2.book_id > b1.book_id
       JOIN book_sizes sz1 ON sz1.book_id = b1.book_id
       JOIN book_sizes sz2 ON sz2.book_id = b2.book_id
       WHERE (${selectedBook ? `b1.book_id = $2 OR b2.book_id = $2` : '1=1'})
       GROUP BY b1.book_id, b1.book_name, b2.book_id, b2.book_name, sz1.sz, sz2.sz
       HAVING COUNT(DISTINCT b1.takhrij_id) >= $1
       ORDER BY shared_hadiths DESC
       LIMIT 100`,
      selectedBook ? [minShared, selectedBook] : [minShared]
    ).catch(() => ({ rows: [] as BookPairRow[] })),

    // For a selected book: all its shared-hadith relationships
    selectedBook ? pool.query<{ other_id: number; other_name: string; shared: number; total: number }>(
      `WITH book_hadith_sets AS (
         SELECT b.id AS book_id, b.title AS book_name, ht.takhrij_id
         FROM books b
         JOIN hadith_toc ht ON ht.book_id = b.id
         WHERE ht.takhrij_id IS NOT NULL
       )
       SELECT
         b2.book_id AS other_id,
         b2.book_name AS other_name,
         COUNT(DISTINCT b1.takhrij_id)::int AS shared,
         (SELECT COUNT(DISTINCT ht2.takhrij_id) FROM hadith_toc ht2 WHERE ht2.book_id = b2.book_id AND ht2.takhrij_id IS NOT NULL)::int AS total
       FROM book_hadith_sets b1
       JOIN book_hadith_sets b2 ON b2.takhrij_id = b1.takhrij_id AND b2.book_id != $1
       WHERE b1.book_id = $1
       GROUP BY b2.book_id, b2.book_name
       HAVING COUNT(DISTINCT b1.takhrij_id) >= 1
       ORDER BY shared DESC
       LIMIT 30`,
      [selectedBook]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ])

  const bookStats = bookStatsRes.rows
  const pairs = pairsRes.rows
  const related = relatedRes.rows
  const selectedBookInfo = selectedBook ? bookStats.find(b => b.id === selectedBook) : null

  const maxShared = Math.max(...pairs.map(p => p.shared_hadiths), 1)

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تداخل الكتب وتشعب الأسانيد</h1>
        <p className="text-sm text-gray-500">
          الأحاديث المشتركة بين كتب الحديث عبر مُعرِّف التخريج — يكشف شبكة المصادر والروابط بين المصنَّفات
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center mb-5">
        <NavigateSelect
          href={`/books/transmission-genealogy?min_shared=${minShared}`}
          param="book"
          defaultValue={selectedBook}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:border-green-400">
          <option value="">جميع الكتب</option>
          {bookStats.map(b => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </NavigateSelect>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500 text-xs">حد أدنى:</span>
          {[5, 10, 25, 50, 100].map(n => (
            <a key={n}
              href={`/books/transmission-genealogy?${selectedBook ? `book=${selectedBook}&` : ''}min_shared=${n}`}
              className={`text-xs px-2.5 py-1 rounded-full border ${minShared === n ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
              {n}+
            </a>
          ))}
        </div>
      </div>

      {/* Selected book: related books */}
      {selectedBook && selectedBookInfo && (
        <div className="bg-white rounded-xl border border-green-100 p-4 mb-5">
          <h2 className="font-bold text-green-900 mb-1">{selectedBookInfo.name}</h2>
          <div className="flex gap-4 text-xs text-gray-500 mb-3">
            <span>{selectedBookInfo.hadith_count.toLocaleString('ar-EG')} حديث</span>
            <span>{selectedBookInfo.takhrij_count.toLocaleString('ar-EG')} مخرَّج</span>
            <span>{selectedBookInfo.unique_pct}% منفرد</span>
          </div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            الكتب التي تشاركه الأحاديث ({related.length})
          </h3>
          <div className="space-y-1.5">
            {related.map((r: { other_id: number; other_name: string; shared: number; total: number }) => (
              <div key={r.other_id} className="flex items-center gap-3">
                <a href={`/books/transmission-genealogy?book=${r.other_id}&min_shared=${minShared}`}
                  className="text-xs text-green-800 hover:underline w-40 truncate shrink-0">
                  {r.other_name}
                </a>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full"
                    style={{ width: `${Math.min(100, (r.shared / (selectedBookInfo.takhrij_count || 1)) * 100)}%` }} />
                </div>
                <span className="text-xs text-gray-500 shrink-0 w-20 text-left">
                  {r.shared.toLocaleString('ar-EG')} مشترك
                </span>
                <span className="text-xs text-gray-300 shrink-0">
                  {Math.round((r.shared / (selectedBookInfo.takhrij_count || 1)) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Book stats overview */}
      {!selectedBook && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
          <div className="bg-green-50 px-4 py-2 border-b border-gray-100 text-xs text-green-800 font-medium">
            نظرة على الكتب — الأحاديث المنفردة والمشتركة
          </div>
          <div className="divide-y divide-gray-50">
            {bookStats.slice(0, 20).map(b => (
              <div key={b.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                <a href={`/books/transmission-genealogy?book=${b.id}&min_shared=${minShared}`}
                  className="text-sm text-green-800 hover:underline w-36 shrink-0 truncate">
                  {b.name}
                </a>
                <div className="flex-1 bg-gray-100 rounded-full h-2 max-w-48">
                  <div className="h-2 rounded-full flex overflow-hidden rounded-full">
                    <div className="bg-amber-400 h-full"
                      style={{ width: `${b.unique_pct}%` }} />
                    <div className="bg-blue-300 h-full"
                      style={{ width: `${100 - b.unique_pct}%` }} />
                  </div>
                </div>
                <div className="text-xs text-gray-400 shrink-0 text-left w-32">
                  <span className="text-amber-600">{b.unique_pct}%</span> منفرد ·{' '}
                  <span className="text-gray-400">{b.hadith_count.toLocaleString('ar-EG')}</span> حديث
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 bg-gray-50 text-xs text-gray-400">
            <span className="inline-block w-3 h-2 bg-amber-400 rounded ml-1" />منفرد (لا يوجد في كتاب آخر)
            <span className="inline-block w-3 h-2 bg-blue-300 rounded mr-3 ml-1" />مشترك مع كتب أخرى
          </div>
        </div>
      )}

      {/* Pair overlap table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="bg-blue-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
          <span className="text-xs text-blue-800 font-medium">
            أزواج الكتب المتشابكة ({pairs.length} زوج)
          </span>
          <span className="text-xs text-gray-400">مرتبة بعدد الأحاديث المشتركة</span>
        </div>
        <div className="divide-y divide-gray-50">
          {pairs.map((p, i) => (
            <div key={`${p.book1_id}-${p.book2_id}`}
              className="px-4 py-3 hover:bg-blue-50 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-xs text-gray-300 w-5 shrink-0 mt-1">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <a href={`/books/transmission-genealogy?book=${p.book1_id}&min_shared=${minShared}`}
                      className="text-sm font-medium text-green-800 hover:underline">
                      {p.book1_name}
                    </a>
                    <span className="text-gray-300 text-xs">↔</span>
                    <a href={`/books/transmission-genealogy?book=${p.book2_id}&min_shared=${minShared}`}
                      className="text-sm font-medium text-blue-800 hover:underline">
                      {p.book2_name}
                    </a>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-indigo-400 h-1.5 rounded-full"
                        style={{ width: `${(p.shared_hadiths / maxShared) * 100}%` }} />
                    </div>
                    <span className="text-xs text-indigo-700 font-medium">
                      {p.shared_hadiths.toLocaleString('ar-EG')} مشترك
                    </span>
                    <span className="text-xs text-gray-400">
                      ({p.overlap_pct_1}% من الأول · {p.overlap_pct_2}% من الثاني)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        {pairs.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            لا توجد أزواج بهذا الحد — جرب تقليل الحد الأدنى
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
        <Link href="/books/intersection" className="text-green-700 hover:underline">← تقاطع الكتب</Link>
        <Link href="/books/uniqueness" className="text-green-700 hover:underline">← تفرد الكتب</Link>
      </div>
    </div>
  )
}
