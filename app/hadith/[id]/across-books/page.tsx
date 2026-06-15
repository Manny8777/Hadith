import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface ParallelVersion {
  parallel_id: number
  book_id: number
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  hadith_number: string | null
  tarf: string | null
  chain_count: number
}

function stripTags(s: string | null) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function AcrossBooksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const [hadithRes, groupRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.id AS book_id, b.takhrij_author, b.takhrij_death
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1 AND ht.is_leaf = true`,
      [hadithId]
    ),
    pool.query<{ group_id: number }>(
      `SELECT group_id FROM takhrij WHERE hadith_id = $1 AND group_id IS NOT NULL LIMIT 1`,
      [hadithId]
    ),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const groupId = groupRes.rows[0]?.group_id

  if (!groupId) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
          <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">← الحديث</Link>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-3">الحديث في كتب الحديث</h1>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لا يوجد تخريج مشترك لهذا الحديث
        </div>
      </div>
    )
  }

  const versionsRes = await pool.query<ParallelVersion>(
    `SELECT DISTINCT ON (b.id)
           t.hadith_id AS parallel_id,
           b.id AS book_id, b.title AS book_title, b.takhrij_author, b.takhrij_death,
           ht.tarqeem_harf AS hadith_number,
           regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
           (
             SELECT COUNT(DISTINCT ih2.isnad_id)::int
             FROM isnad_hadiths ih2
             WHERE ih2.hadith_id = t.hadith_id
           ) AS chain_count
     FROM takhrij t
     JOIN books b ON b.id = t.book_id
     JOIN hadith_toc ht ON ht.main_id = t.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
     WHERE t.group_id = $1
     ORDER BY b.id, b.takhrij_death ASC NULLS LAST`,
    [groupId]
  ).catch(() => ({ rows: [] as ParallelVersion[] }))

  const versions = versionsRes.rows.sort((a, b) =>
    (a.takhrij_death || 9999) - (b.takhrij_death || 9999)
  )

  const thisVersion = versions.find(v => v.parallel_id === hadithId)
  const otherVersions = versions.filter(v => v.parallel_id !== hadithId)

  // Find common words across all tarfs (very basic word overlap analysis)
  const allTarfs = versions.map(v => stripTags(v.tarf))
  const wordSets = allTarfs.map(t =>
    new Set(t.split(/\s+/).filter(w => w.length > 2))
  )
  const allWords = new Set(wordSets.flatMap(s => Array.from(s)))
  const commonWords = new Set<string>()
  for (const word of allWords) {
    if (wordSets.filter(s => s.has(word)).length >= Math.ceil(versions.length * 0.7)) {
      commonWords.add(word)
    }
  }

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="hover:text-green-700">الكتب</Link>
        <span>›</span>
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">في كتب الحديث</span>
      </div>

      <h1 className="text-xl font-bold text-green-900 mb-1">الحديث في كتب الحديث</h1>
      <p className="text-sm text-gray-600 line-clamp-2 mb-1">{stripTags(hadith.tarf).slice(0, 150)}</p>
      <p className="text-xs text-gray-400 mb-4">{hadith.book_title} — {hadith.takhrij_author}</p>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        <div className="bg-green-800 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{versions.length.toLocaleString('ar-EG')}</div>
          <div className="text-xs opacity-80">كتاب يحتوي الحديث</div>
        </div>
        <div className="bg-indigo-700 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">
            {versions[0]?.takhrij_death?.toLocaleString('ar-EG') || '—'}هـ
          </div>
          <div className="text-xs opacity-80">أقدم مصدر</div>
        </div>
        <div className="bg-amber-600 text-white rounded-xl p-3 text-center">
          <div className="text-xl font-bold">{groupId}</div>
          <div className="text-xs opacity-80">رقم المجموعة</div>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        <span className="font-semibold">أداة بحثية: </span>
        مقارنة ألفاظ الحديث عبر مصادره المختلفة (اختلاف المتن) من أدوات النقد الحديثي الحديث.
        يكشف هذا العرض الروايات الأوفى لفظاً والأكثر اختصاراً، والتنويع في الصياغة عند المحدثين.
      </div>

      {/* Versions sorted by date */}
      <div className="space-y-3">
        {versions.map((v, idx) => {
          const text = stripTags(v.tarf)
          const isSource = v.parallel_id === hadithId
          const isOldest = idx === 0

          return (
            <div key={`${v.book_id}-${v.parallel_id}`}
              className={`rounded-xl border p-4 transition-all ${
                isSource ? 'border-green-400 bg-green-50' :
                isOldest ? 'border-amber-300 bg-amber-50' :
                'border-gray-100 bg-white hover:border-green-200 hover:shadow-sm'
              }`}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  {isOldest && (
                    <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">
                      الأقدم
                    </span>
                  )}
                  {isSource && (
                    <span className="text-xs bg-green-700 text-white px-1.5 py-0.5 rounded-full font-medium">
                      المصدر
                    </span>
                  )}
                  <Link href={`/books/${v.book_id}`}
                    className="text-sm font-bold text-green-900 hover:underline">
                    {v.book_title}
                  </Link>
                  {v.takhrij_author && (
                    <span className="text-xs text-gray-500">{v.takhrij_author}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {v.takhrij_death && (
                    <span className="text-xs text-gray-400">ت {v.takhrij_death}هـ</span>
                  )}
                  {v.hadith_number && (
                    <span className="text-xs text-gray-400">رقم {v.hadith_number}</span>
                  )}
                  {v.chain_count > 1 && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {v.chain_count} أسانيد
                    </span>
                  )}
                  {!isSource && (
                    <Link href={`/hadith/${v.parallel_id}`}
                      className="text-xs text-indigo-600 hover:underline">عرض ←</Link>
                  )}
                </div>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">
                {text.slice(0, 350) || '...'}
                {text.length > 350 && <span className="text-gray-400">...</span>}
              </p>
            </div>
          )
        })}
      </div>

      {versions.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لم يُعثر على نسخ موازية
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/witnesses`} className="text-green-700 hover:underline">← الشواهد</Link>
        <Link href={`/hadith/${hadithId}/transmission-history`} className="text-green-700 hover:underline">← التاريخ الزمني</Link>
        <Link href="/matn-compare" className="text-green-700 hover:underline">← مقارنة المتون</Link>
      </div>
    </div>
  )
}
