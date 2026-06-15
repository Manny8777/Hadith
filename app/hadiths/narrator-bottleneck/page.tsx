import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface BottleneckHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  total_chains: number
  bottleneck_narrator_id: number
  bottleneck_name: string
  bottleneck_grade: string | null
  bottleneck_is_companion: boolean
  chains_through_bottleneck: number
  bottleneck_position: number
  judgment_text: string | null
}

export default async function NarratorBottleneckPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string; page?: string; pos?: string }>
}) {
  const sp = await searchParams
  const gradeFilter = sp.grade || ''
  const posFilter = parseInt(sp.pos || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const gradeSql = gradeFilter === 'daif' ? `AND n2.grade ~* 'ضعيف'`
    : gradeFilter === 'maqbul' ? `AND n2.grade ~* 'مقبول|لين'`
    : gradeFilter === 'unknown' ? `AND (n2.grade IS NULL OR n2.grade = '')`
    : ''

  const posSql = posFilter ? `AND bottleneck_position = ${posFilter}` : ''

  const [haditshRes, statsRes] = await Promise.all([
    pool.query<BottleneckHadith>(
      `WITH hadith_chain_counts AS (
         SELECT ih.hadith_id, COUNT(DISTINCT ic.id)::int AS total_chains
         FROM isnad_hadiths ih
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         GROUP BY ih.hadith_id
         HAVING COUNT(DISTINCT ic.id) >= 2
       ),
       narrator_chain_coverage AS (
         SELECT
           ih.hadith_id,
           nid AS narrator_id,
           ord::int AS narrator_position,
           COUNT(DISTINCT ic.id)::int AS chains_through
         FROM isnad_hadiths ih
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord) ON true
         GROUP BY ih.hadith_id, nid, ord::int
       )
       SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 220) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         hcc.total_chains,
         ncc.narrator_id AS bottleneck_narrator_id,
         n2.name AS bottleneck_name,
         n2.grade AS bottleneck_grade,
         n2.is_companion AS bottleneck_is_companion,
         ncc.chains_through AS chains_through_bottleneck,
         ncc.narrator_position AS bottleneck_position,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text
       FROM hadith_chain_counts hcc
       JOIN narrator_chain_coverage ncc ON ncc.hadith_id = hcc.hadith_id
         AND ncc.chains_through = hcc.total_chains
       JOIN hadith_toc ht ON ht.main_id = hcc.hadith_id
       JOIN books b ON b.id = ht.book_id
       JOIN narrators n2 ON n2.id = ncc.narrator_id
       WHERE ncc.narrator_position > 1
         AND NOT n2.is_companion
         ${gradeSql}
         ${posSql}
       ORDER BY hcc.total_chains DESC, ncc.narrator_position ASC
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    ).catch(() => ({ rows: [] as BottleneckHadith[] })),

    pool.query<{ grade_type: string; count: number }>(
      `WITH hadith_chain_counts AS (
         SELECT ih.hadith_id, COUNT(DISTINCT ic.id)::int AS total_chains
         FROM isnad_hadiths ih
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         GROUP BY ih.hadith_id
         HAVING COUNT(DISTINCT ic.id) >= 2
       ),
       narrator_chain_coverage AS (
         SELECT ih.hadith_id, nid AS narrator_id
         FROM isnad_hadiths ih
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord) ON true
         WHERE ord > 1
         GROUP BY ih.hadith_id, nid
         HAVING COUNT(DISTINCT ic.id) = (SELECT COUNT(DISTINCT ic2.id) FROM isnad_hadiths ih2 JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id WHERE ih2.hadith_id = ih.hadith_id)
       )
       SELECT
         CASE
           WHEN n2.grade ~* 'ثقة' THEN 'ثقة'
           WHEN n2.grade ~* 'صدوق' THEN 'صدوق'
           WHEN n2.grade ~* 'ضعيف' THEN 'ضعيف'
           WHEN n2.grade ~* 'مقبول|لين' THEN 'مقبول'
           ELSE 'غير معروف'
         END AS grade_type,
         COUNT(DISTINCT hcc.hadith_id)::int AS count
       FROM hadith_chain_counts hcc
       JOIN narrator_chain_coverage ncc ON ncc.hadith_id = hcc.hadith_id
       JOIN narrators n2 ON n2.id = ncc.narrator_id AND NOT n2.is_companion
       GROUP BY 1
       ORDER BY count DESC`
    ).catch(() => ({ rows: [] })),
  ])

  const hadiths = haditshRes.rows
  const stats = statsRes.rows

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700 bg-green-50 border-green-100'
    if (/صدوق/.test(g)) return 'text-blue-600 bg-blue-50 border-blue-100'
    if (/ضعيف/.test(g)) return 'text-red-600 bg-red-50 border-red-100'
    if (/مقبول|لين/.test(g)) return 'text-amber-600 bg-amber-50 border-amber-100'
    return 'text-gray-500 bg-gray-50 border-gray-100'
  }

  const GRADE_OPTIONS = [
    { key: '', label: 'جميع الدرجات' },
    { key: 'daif', label: 'ضعيف' },
    { key: 'maqbul', label: 'مقبول / لين' },
    { key: 'unknown', label: 'غير معروف' },
  ]

  const POS_OPTIONS = [
    { key: 0, label: 'جميع المواضع' },
    { key: 2, label: 'الثاني (تلميذ الصحابي)' },
    { key: 3, label: 'الثالث' },
    { key: 4, label: 'الرابع' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الراوي الوحيد — أحاديث تجري في سند واحد</h1>
        <p className="text-sm text-gray-500">
          أحاديث تتعدد أسانيدها لكن كلها تمر بشخص واحد في نقطة بعينها — راوٍ وحيد يحمل الحديث من صحابيه
        </p>
      </div>

      <div className="flex gap-2 flex-wrap mb-4">
        {GRADE_OPTIONS.map(opt => (
          <a key={opt.key}
            href={`/hadiths/narrator-bottleneck?grade=${opt.key}${posFilter ? `&pos=${posFilter}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${gradeFilter === opt.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {opt.label}
          </a>
        ))}
        <span className="text-gray-300 text-xs self-center">|</span>
        {POS_OPTIONS.map(opt => (
          <a key={opt.key}
            href={`/hadiths/narrator-bottleneck?${gradeFilter ? `grade=${gradeFilter}&` : ''}pos=${opt.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${(posFilter || 0) === opt.key ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>
            {opt.label}
          </a>
        ))}
      </div>

      {stats.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4 flex gap-4 flex-wrap">
          {stats.map(s => (
            <div key={s.grade_type} className="text-center">
              <div className="text-xl font-bold text-green-700">{s.count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-500">حديث بحمَّال {s.grade_type}</div>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={`${h.hadith_id}-${h.bottleneck_narrator_id}`}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3 mb-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                  <span className="text-xs text-gray-500">{h.book_name}</span>
                  {h.judgment_text && (
                    <span className="text-xs text-gray-400">{h.judgment_text.slice(0, 30)}</span>
                  )}
                </div>
                <p className="text-sm text-gray-900 leading-relaxed">
                  {h.hadith_text}{h.hadith_text?.length === 220 && '...'}
                </p>
              </div>
              <div className="shrink-0 text-left">
                <div className="text-lg font-bold text-green-700">{h.total_chains}</div>
                <div className="text-xs text-gray-400">أسانيد</div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-amber-700 font-medium">الراوي المحوري (موضع {h.bottleneck_position.toLocaleString('ar-EG')}):</span>
              <Link href={`/narrator/${h.bottleneck_narrator_id}`}
                className="text-sm font-bold text-amber-900 hover:underline">
                {h.bottleneck_name.split(' ').slice(0, 3).join(' ')}
              </Link>
              {h.bottleneck_grade && (
                <span className={`text-xs px-2 py-0.5 rounded-full border ${gradeColor(h.bottleneck_grade)}`}>
                  {h.bottleneck_grade.slice(0, 20)}
                </span>
              )}
              <span className="text-xs text-amber-600 mr-auto">
                يمر به {h.chains_through_bottleneck} من {h.total_chains} أسانيد ({Math.round(h.chains_through_bottleneck * 100 / h.total_chains)}%)
              </span>
            </div>

            <div className="flex gap-3 mt-2 text-xs">
              <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
              <Link href={`/hadith/${h.hadith_id}/chain-weakness`} className="text-red-600 hover:underline">الحلقات ←</Link>
              <Link href={`/narrator/${h.bottleneck_narrator_id}`} className="text-amber-700 hover:underline">ترجمة الراوي ←</Link>
            </div>
          </div>
        ))}

        {hadiths.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
            لا توجد نتائج لهذه المعايير
          </div>
        )}
      </div>

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/narrator-bottleneck?grade=${gradeFilter}&page=${page - 1}${posFilter ? `&pos=${posFilter}` : ''}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              ← السابق
            </a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/narrator-bottleneck?grade=${gradeFilter}&page=${page + 1}${posFilter ? `&pos=${posFilter}` : ''}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
              التالي →
            </a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
        <Link href="/hadiths/weakness-catalog" className="text-green-700 hover:underline">← فهرس الضعف</Link>
        <Link href="/narrators/hub-analysis" className="text-green-700 hover:underline">← مراكز الشبكة</Link>
      </div>
    </div>
  )
}
