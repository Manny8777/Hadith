import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface LengthBucket {
  bucket: string
  bucket_order: number
  hadith_count: number
  avg_words: number
  book_count: number
}

interface BookLength {
  book_id: number
  book_name: string
  hadith_count: number
  avg_chars: number
  avg_words: number
  min_chars: number
  max_chars: number
  short_pct: number
  long_pct: number
}

interface SampleHadith {
  hadith_id: number
  text_preview: string
  book_name: string
  char_len: number
}

export default async function TextLengthPage({
  searchParams,
}: {
  searchParams: Promise<{ book?: string; bucket?: string; sort?: string }>
}) {
  const sp = await searchParams
  const selectedBook = parseInt(sp.book || '0') || null
  const selectedBucket = sp.bucket || ''
  const sortBy = sp.sort || 'avg'

  const orderSql = sortBy === 'short' ? 'short_pct DESC'
    : sortBy === 'long' ? 'long_pct DESC'
    : sortBy === 'total' ? 'hadith_count DESC'
    : 'avg_chars DESC'

  const [booksRes, bucketsRes, samplesRes] = await Promise.all([
    pool.query<BookLength>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         COUNT(ht.main_id)::int AS hadith_count,
         ROUND(AVG(LENGTH(coalesce(ht.tarf,''))))::int AS avg_chars,
         ROUND(AVG(array_length(string_to_array(trim(coalesce(ht.tarf,'')), ' '), 1)))::int AS avg_words,
         MIN(LENGTH(coalesce(ht.tarf,'')))::int AS min_chars,
         MAX(LENGTH(coalesce(ht.tarf,'')))::int AS max_chars,
         ROUND(100.0 * COUNT(*) FILTER (WHERE LENGTH(coalesce(ht.tarf,'')) < 100) / NULLIF(COUNT(*), 0))::int AS short_pct,
         ROUND(100.0 * COUNT(*) FILTER (WHERE LENGTH(coalesce(ht.tarf,'')) > 500) / NULLIF(COUNT(*), 0))::int AS long_pct
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id AND ht.is_leaf = true AND ht.is_paragraph = true
       WHERE ht.tarf IS NOT NULL AND LENGTH(coalesce(ht.tarf,'')) > 5
       GROUP BY b.id, b.title
       HAVING COUNT(ht.main_id) >= 50
       ORDER BY ${orderSql}
       LIMIT 50`,
      []
    ).catch(() => ({ rows: [] as BookLength[] })),

    pool.query<LengthBucket>(
      `SELECT
         CASE
           WHEN LENGTH(coalesce(ht.tarf,'')) < 50 THEN 'قصير جداً (< 50 حرف)'
           WHEN LENGTH(coalesce(ht.tarf,'')) < 100 THEN 'قصير (50-100)'
           WHEN LENGTH(coalesce(ht.tarf,'')) < 200 THEN 'متوسط (100-200)'
           WHEN LENGTH(coalesce(ht.tarf,'')) < 400 THEN 'طويل (200-400)'
           WHEN LENGTH(coalesce(ht.tarf,'')) < 800 THEN 'طويل جداً (400-800)'
           ELSE 'مطوَّل (800+)'
         END AS bucket,
         CASE
           WHEN LENGTH(coalesce(ht.tarf,'')) < 50 THEN 1
           WHEN LENGTH(coalesce(ht.tarf,'')) < 100 THEN 2
           WHEN LENGTH(coalesce(ht.tarf,'')) < 200 THEN 3
           WHEN LENGTH(coalesce(ht.tarf,'')) < 400 THEN 4
           WHEN LENGTH(coalesce(ht.tarf,'')) < 800 THEN 5
           ELSE 6
         END AS bucket_order,
         COUNT(*)::int AS hadith_count,
         ROUND(AVG(array_length(string_to_array(trim(coalesce(ht.tarf,'')), ' '), 1)))::int AS avg_words,
         COUNT(DISTINCT ht.book_id)::int AS book_count
       FROM hadith_toc ht
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.tarf IS NOT NULL AND LENGTH(coalesce(ht.tarf,'')) > 5
       GROUP BY bucket, bucket_order
       ORDER BY bucket_order`,
      []
    ).catch(() => ({ rows: [] as LengthBucket[] })),

    (selectedBook || selectedBucket) ? pool.query<SampleHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(coalesce(ht.tarf,''), 200) AS text_preview,
         b.title AS book_name,
         LENGTH(coalesce(ht.tarf,''))::int AS char_len
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.tarf IS NOT NULL
         AND ($1::int IS NULL OR ht.book_id = $1)
         AND ($2 = '' OR (
           CASE
             WHEN LENGTH(coalesce(ht.tarf,'')) < 50 THEN 'قصير جداً (< 50 حرف)'
             WHEN LENGTH(coalesce(ht.tarf,'')) < 100 THEN 'قصير (50-100)'
             WHEN LENGTH(coalesce(ht.tarf,'')) < 200 THEN 'متوسط (100-200)'
             WHEN LENGTH(coalesce(ht.tarf,'')) < 400 THEN 'طويل (200-400)'
             WHEN LENGTH(coalesce(ht.tarf,'')) < 800 THEN 'طويل جداً (400-800)'
             ELSE 'مطوَّل (800+)'
           END = $2
         ))
       ORDER BY LENGTH(coalesce(ht.tarf,'')) DESC
       LIMIT 15`,
      [selectedBook || null, selectedBucket || '']
    ).catch(() => ({ rows: [] as SampleHadith[] })) : Promise.resolve({ rows: [] as SampleHadith[] }),
  ])

  const books = booksRes.rows
  const buckets = bucketsRes.rows
  const samples = samplesRes.rows

  const totalHadiths = buckets.reduce((s, b) => s + b.hadith_count, 0)
  const maxBucketCount = Math.max(...buckets.map(b => b.hadith_count), 1)
  const maxAvgChars = Math.max(...books.map(b => b.avg_chars), 1)

  const SORT_OPTIONS = [
    { key: 'avg', label: 'الأطول متوسطاً' },
    { key: 'short', label: 'الأكثر أحاديث قصيرة' },
    { key: 'long', label: 'الأكثر أحاديث طويلة' },
    { key: 'total', label: 'بعدد الأحاديث' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">توزيع أطوال نصوص الأحاديث</h1>
        <p className="text-sm text-gray-500">
          كيف تتوزع الأحاديث حسب طول نصها؟ — ويكشف أي الكتب تحوي أحاديث مطوَّلة وأيها يقتصر على القصيرة — مؤشر لأسلوب التصنيف ومنهج الرواية
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="font-bold text-green-900 text-sm mb-3">التوزيع العام لجميع الأحاديث</h2>
        <div className="space-y-2">
          {buckets.map(b => {
            const barPct = Math.round((b.hadith_count / maxBucketCount) * 100)
            const totalPct = Math.round((b.hadith_count / totalHadiths) * 100)
            const isSelected = selectedBucket === b.bucket
            return (
              <a key={b.bucket}
                href={`/hadiths/text-length?bucket=${encodeURIComponent(b.bucket)}`}
                className={`flex items-center gap-2 group hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                <span className={`text-xs shrink-0 w-40 ${isSelected ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                  {b.bucket}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 max-w-64">
                  <div className={`h-4 rounded-full transition-all ${isSelected ? 'bg-green-500' : 'bg-teal-300 group-hover:bg-teal-400'}`}
                    style={{ width: `${barPct}%` }} />
                </div>
                <span className={`text-xs font-medium shrink-0 ${isSelected ? 'text-green-700' : 'text-gray-600'}`}>
                  {b.hadith_count.toLocaleString('ar-EG')}
                </span>
                <span className="text-xs text-gray-400 shrink-0">({totalPct}%)</span>
                <span className="text-xs text-gray-400 shrink-0">~{b.avg_words} كلمة</span>
              </a>
            )
          })}
        </div>
        {selectedBucket && (
          <div className="mt-2">
            <a href="/hadiths/text-length" className="text-xs text-red-500 hover:underline">× مسح الفلتر</a>
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">ترتيب الكتب:</span>
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/hadiths/text-length?sort=${s.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
        {selectedBook && (
          <a href={`/hadiths/text-length?sort=${sortBy}`} className="text-xs text-red-500 hover:underline">× مسح الكتاب</a>
        )}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-teal-50 px-4 py-2 border-b border-teal-100 text-xs text-teal-800 font-medium">
              الكتب — {SORT_OPTIONS.find(s => s.key === sortBy)?.label}
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {books.map((bk, i) => {
                const isSelected = selectedBook === bk.book_id
                const barW = Math.round((bk.avg_chars / maxAvgChars) * 100)
                return (
                  <a key={bk.book_id}
                    href={`/hadiths/text-length?sort=${sortBy}&book=${bk.book_id}`}
                    className={`px-4 py-3 flex items-center gap-3 hover:bg-teal-50 transition-colors ${isSelected ? 'bg-teal-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-sm font-medium ${isSelected ? 'text-teal-900' : 'text-gray-800'} hover:underline`}>
                          {bk.book_name}
                        </span>
                        <span className="text-xs text-gray-400 mr-auto">{bk.hadith_count.toLocaleString('ar-EG')} حديث</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                          <div className="bg-teal-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-teal-700">{bk.avg_chars.toLocaleString('ar-EG')} حرف</span>
                        <span className="text-xs text-gray-400">~{bk.avg_words} كلمة</span>
                      </div>
                    </div>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {samples.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-teal-50 px-4 py-2 border-b border-teal-100 text-xs text-teal-800 font-medium">
                عينة من النتائج ({samples.length})
              </div>
              <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                {samples.map(s => (
                  <div key={s.hadith_id} className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-1 text-xs">
                      <span className="text-gray-500">{s.book_name}</span>
                      <span className="text-teal-600 shrink-0">{s.char_len.toLocaleString('ar-EG')} حرف</span>
                    </div>
                    <p className="text-xs text-gray-800 leading-relaxed mb-1 line-clamp-2">{s.text_preview}...</p>
                    <Link href={`/hadith/${s.hadith_id}`} className="text-xs text-green-700 hover:underline">←</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-teal-50 rounded-xl border border-teal-100 p-6 text-center">
              <div className="text-sm text-teal-700">اضغط على كتاب أو فئة طول لعرض عينة من أحاديثها</div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/grade-by-book" className="text-green-700 hover:underline">← درجات الأحاديث بالكتاب</Link>
        <Link href="/books" className="text-green-700 hover:underline">← الكتب</Link>
      </div>
    </div>
  )
}
