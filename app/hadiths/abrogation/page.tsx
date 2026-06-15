import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface AbrogationHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  judgment_text: string
  scholar_name: string
  abrogation_type: string
  chain_count: number
}

interface AbrogationStats {
  abrogation_type: string
  count: number
}

const ABROGATION_TYPES = [
  { key: 'nasikh', label: 'ناسخ', pattern: '\\bناسخ|منسوخ\\b|نسخ.*حكم|نسخه', color: 'bg-green-50 border-green-200 text-green-800' },
  { key: 'mansukh', label: 'منسوخ', pattern: 'منسوخ|نُسخ|نسخته', color: 'bg-red-50 border-red-200 text-red-800' },
  { key: 'mutaqaddam', label: 'متقدم ومتأخر', pattern: 'متأخر|متقدم|آخر الأمرين|الآخر من أمر', color: 'bg-amber-50 border-amber-200 text-amber-800' },
  { key: 'mansukh_bi', label: 'نسخ بالآية', pattern: 'نسخته.*آية|نسخت.*بقوله|جاءت.*آية', color: 'bg-purple-50 border-purple-200 text-purple-800' },
]

export default async function AbrogationPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedType = sp.type || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const selectedAbrogType = ABROGATION_TYPES.find(t => t.key === selectedType)

  const typePattern = selectedAbrogType?.pattern || 'ناسخ|منسوخ|نسخ|نُسخ'

  const [statsRes, haditshRes] = await Promise.all([
    pool.query<AbrogationStats>(
      `SELECT
         CASE
           WHEN hj.say_text ~* $1 THEN 'ناسخ'
           WHEN hj.say_text ~* $2 THEN 'منسوخ'
           WHEN hj.say_text ~* $3 THEN 'متقدم ومتأخر'
           WHEN hj.say_text ~* $4 THEN 'نسخ بالآية'
           ELSE 'أخرى'
         END AS abrogation_type,
         COUNT(DISTINCT hj.hadith_id)::int AS count
       FROM hadith_judgments hj
       WHERE hj.say_text ~* 'ناسخ|منسوخ|نسخ|نُسخ'
       GROUP BY 1
       ORDER BY count DESC`,
      ABROGATION_TYPES.map(t => t.pattern)
    ).catch(() => ({ rows: [] as AbrogationStats[] })),

    pool.query<AbrogationHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g'), 220) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         hj.say_text AS judgment_text,
         n.name AS scholar_name,
         CASE
           WHEN hj.say_text ~* $1 THEN 'ناسخ'
           WHEN hj.say_text ~* $2 THEN 'منسوخ'
           WHEN hj.say_text ~* $3 THEN 'متقدم ومتأخر'
           WHEN hj.say_text ~* $4 THEN 'نسخ بالآية'
           ELSE 'أخرى'
         END AS abrogation_type,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       WHERE hj.say_text ~* $5
       ORDER BY ht.main_id
       LIMIT $6 OFFSET $7`,
      [...ABROGATION_TYPES.map(t => t.pattern), typePattern, pageSize, offset]
    ).catch(() => ({ rows: [] as AbrogationHadith[] })),
  ])

  const stats = statsRes.rows
  const hadiths = haditshRes.rows

  function abrTypeStyle(type: string) {
    const found = ABROGATION_TYPES.find(t => t.label === type)
    return found?.color || 'bg-gray-50 border-gray-200 text-gray-700'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الناسخ والمنسوخ</h1>
        <p className="text-sm text-gray-500">
          أحاديث ورد في أحكام العلماء عليها ذكر النسخ — ناسخ أو منسوخ أو متقدم ومتأخر — أداة لبحث تاريخ تطور الأحكام الفقهية
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {ABROGATION_TYPES.map(t => {
          const statRow = stats.find(s => s.abrogation_type === t.label)
          return (
            <a key={t.key}
              href={`/hadiths/abrogation?type=${t.key}`}
              className={`border-2 rounded-xl px-4 py-3 transition-all hover:shadow-sm ${selectedType === t.key ? t.color + ' ring-2 ring-offset-1 ring-green-400' : t.color + ' opacity-80 hover:opacity-100'}`}>
              <div className="font-bold text-sm mb-1">{t.label}</div>
              <div className="text-xl font-bold">{(statRow?.count || 0).toLocaleString('ar-EG')}</div>
              <div className="text-xs opacity-70">حديث</div>
            </a>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <a href="/hadiths/abrogation"
          className={`text-xs px-3 py-1.5 rounded-full border ${!selectedType ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200'}`}>
          جميع أنواع النسخ
        </a>
        {ABROGATION_TYPES.map(t => (
          <a key={t.key}
            href={`/hadiths/abrogation?type=${t.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${selectedType === t.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {t.label}
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={`${h.hadith_id}-${h.scholar_name}`}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                  <span className="text-xs text-gray-500">{h.book_name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full border ${abrTypeStyle(h.abrogation_type)}`}>
                    {h.abrogation_type}
                  </span>
                  <span className="text-xs text-gray-300 mr-auto">{h.chain_count} سند</span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text}{h.hadith_text?.length === 220 && '...'}
                </p>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              <span className="text-xs text-amber-700 font-medium">{h.scholar_name}: </span>
              <span className="text-xs text-amber-900">{h.judgment_text}</span>
            </div>

            <div className="flex gap-3 mt-2 text-xs">
              <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
              <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
            </div>
          </div>
        ))}

        {hadiths.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
            لا توجد أحاديث مرتبطة بالنسخ في قاعدة البيانات لهذه المعايير
          </div>
        )}
      </div>

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/abrogation?${selectedType ? `type=${selectedType}&` : ''}page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              ← السابق
            </a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/abrogation?${selectedType ? `type=${selectedType}&` : ''}page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              التالي →
            </a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← فهرس علل الحديث</Link>
        <Link href="/scholars/judgment-search" className="text-green-700 hover:underline">← بحث الأحكام</Link>
        <Link href="/hadiths/mawquf" className="text-green-700 hover:underline">← الموقوف والمرسل</Link>
      </div>
    </div>
  )
}
