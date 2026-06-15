import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface KeywordResult {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  judgment_text: string | null
  chain_count: number
}

const THEMATIC_KEYWORDS = [
  { label: 'النية والإخلاص', pattern: 'نية|أعمال بالنيات|إخلاص|ابتغاء', color: 'bg-green-100 text-green-800 border-green-200' },
  { label: 'الرحمة والرأفة', pattern: 'رحمة|رحيم|يرحم|رحم الله|رأفة', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { label: 'التوحيد والإيمان', pattern: 'لا إله إلا الله|توحيد|شهادة|إيمان|مؤمن', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { label: 'الصلاة والعبادة', pattern: 'صلى|يصلي|الصلاة|قام|يقوم|ركع|سجد', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { label: 'الصيام والرمضان', pattern: 'صام|يصوم|رمضان|إفطار|سحور|صيام', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { label: 'الزكاة والصدقة', pattern: 'زكاة|تصدق|الصدقة|صدق|عطاء', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { label: 'الحج والعمرة', pattern: 'حج|عمرة|كعبة|إحرام|طواف|سعي|منى|عرفة', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  { label: 'العلم والتعلم', pattern: 'علم|تعلم|يتعلم|طلب العلم|عالم|فقه', color: 'bg-violet-100 text-violet-800 border-violet-200' },
  { label: 'الأخلاق والأدب', pattern: 'حياء|أمانة|صدق|كذب|غيبة|نميمة|أخلاق', color: 'bg-pink-100 text-pink-800 border-pink-200' },
  { label: 'الجهاد والشهادة', pattern: 'جهاد|جاهد|شهيد|شهادة|قتل في سبيل|غزوة', color: 'bg-red-100 text-red-800 border-red-200' },
  { label: 'الدعاء والذكر', pattern: 'اللهم|يدعو|الدعاء|ذكر الله|تسبيح|استغفر', color: 'bg-cyan-100 text-cyan-800 border-cyan-200' },
  { label: 'الآخرة والجنة', pattern: 'جنة|جهنم|القيامة|يوم القيامة|الآخرة|حساب', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
]

export default async function MatnKeywordsPage({
  searchParams,
}: {
  searchParams: Promise<{ kw?: string; page?: string; book?: string }>
}) {
  const sp = await searchParams
  const selectedKw = sp.kw || ''
  const selectedBook = parseInt(sp.book || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const selectedKeyword = THEMATIC_KEYWORDS.find(k => k.label === selectedKw)

  const [countsRes, haditshRes, booksRes] = await Promise.all([
    pool.query<{ label: string; count: number }>(
      `SELECT unnested.label, COUNT(DISTINCT ht.id)::int AS count
       FROM hadith_toc ht,
       (VALUES ${THEMATIC_KEYWORDS.map((k, i) => `($${i + 1}, $${i + 1 + THEMATIC_KEYWORDS.length})`).join(', ')}) AS unnested(label, pattern)
       WHERE ht.tarf ~* unnested.pattern
       GROUP BY unnested.label`,
      [...THEMATIC_KEYWORDS.map(k => k.label), ...THEMATIC_KEYWORDS.map(k => k.pattern)]
    ).catch(() => ({ rows: [] })),

    selectedKeyword ? pool.query<KeywordResult>(
      `SELECT
         ht.id AS hadith_id,
         LEFT(ht.tarf, 240) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.id) AS chain_count
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.tarf ~* $1
         AND ($2::int IS NULL OR ht.book_id = $2)
       ORDER BY ht.id
       LIMIT $3 OFFSET $4`,
      [selectedKeyword.pattern, selectedBook, pageSize, offset]
    ).catch(() => ({ rows: [] as KeywordResult[] })) : Promise.resolve({ rows: [] as KeywordResult[] }),

    pool.query<{ id: number; name: string }>(
      `SELECT DISTINCT b.id, b.title AS name FROM books b ORDER BY b.title LIMIT 50`
    ).catch(() => ({ rows: [] })),
  ])

  const counts = countsRes.rows
  const hadiths = haditshRes.rows
  const books = booksRes.rows

  const countMap: Record<string, number> = {}
  counts.forEach((c: { label: string; count: number }) => { countMap[c.label] = c.count })
  const maxCount = Math.max(...Object.values(countMap), 1)

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تصفح الأحاديث بالموضوع الكلمي</h1>
        <p className="text-sm text-gray-500">
          بحث في متون الأحاديث بحسب الكلمات المفتاحية والمواضيع الكبرى — اختر موضوعاً لعرض الأحاديث المتعلقة به
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {THEMATIC_KEYWORDS.map(kw => {
          const count = countMap[kw.label] || 0
          const isSelected = selectedKw === kw.label
          return (
            <a key={kw.label}
              href={`/hadiths/matn-keywords?kw=${encodeURIComponent(kw.label)}`}
              className={`border rounded-xl px-4 py-3 transition-all hover:shadow-sm ${isSelected ? 'ring-2 ring-green-400 ' + kw.color : kw.color + ' opacity-80 hover:opacity-100'}`}>
              <div className="font-semibold text-sm mb-1">{kw.label}</div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-white/50 rounded-full h-1.5">
                  <div className="bg-current h-1.5 rounded-full opacity-60"
                    style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="text-xs font-medium">{count.toLocaleString('ar-EG')}</span>
              </div>
            </a>
          )
        })}
      </div>

      {selectedKeyword && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="font-bold text-green-900 text-sm">
              {selectedKeyword.label} — {(countMap[selectedKeyword.label] || 0).toLocaleString('ar-EG')} حديث
            </h2>
            <select
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs"
              value={selectedBook || ''}
              onChange={e => {
                const v = e.target.value
                window.location.href = `/hadiths/matn-keywords?kw=${encodeURIComponent(selectedKeyword.label)}&book=${v}`
              }}>
              <option value="">جميع الكتب</option>
              {books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                  <span className="text-xs text-gray-500">{h.book_name}</span>
                  {h.judgment_text && (
                    <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 30)}</span>
                  )}
                  <span className="text-xs text-gray-300 mr-auto">{h.chain_count} سند</span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text}{h.hadith_text?.length === 240 && '...'}
                </p>
                <div className="flex gap-3 text-xs">
                  <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/chain-weakness`} className="text-red-600 hover:underline">الحلقات ←</Link>
                </div>
              </div>
            ))}

            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد أحاديث لهذا الموضوع بالمعايير المحددة
              </div>
            )}
          </div>

          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && (
                <a href={`/hadiths/matn-keywords?kw=${encodeURIComponent(selectedKeyword.label)}&page=${page - 1}${selectedBook ? `&book=${selectedBook}` : ''}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  ← السابق
                </a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/hadiths/matn-keywords?kw=${encodeURIComponent(selectedKeyword.label)}&page=${page + 1}${selectedBook ? `&book=${selectedBook}` : ''}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  التالي →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/fiqh-map" className="text-green-700 hover:underline">← خريطة الفقه</Link>
        <Link href="/hadiths/advanced-research" className="text-green-700 hover:underline">← البحث المتقدم</Link>
        <Link href="/topics" className="text-green-700 hover:underline">← الفهارس الموضوعية</Link>
      </div>
    </div>
  )
}
