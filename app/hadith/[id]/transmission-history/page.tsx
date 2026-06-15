import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ChainTimestamp {
  chain_id: number
  book_name: string
  chain_length: number
  companion_name: string | null
  earliest_student_death: number | null
  collector_death: number | null
  transmission_span: number | null
  all_narrators: string[]
  all_deaths: (number | null)[]
  judgment_text: string | null
}

interface BookEra {
  book_id: number
  book_name: string
  book_death: number | null
  chain_count: number
  companion_names: string
}

export default async function TransmissionHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hadithId = parseInt(id)

  const [hadithRes, chainsRes, bookTimelineRes] = await Promise.all([
    pool.query<{ text: string; book_name: string }>(
      `SELECT LEFT(ht.tarf, 300) AS text, b.title AS book_name
       FROM hadith_toc ht JOIN books b ON b.id = ht.book_id WHERE ht.main_id = $1`,
      [hadithId]
    ).catch(() => ({ rows: [] })),

    pool.query<ChainTimestamp>(
      `SELECT
         ic.id AS chain_id,
         b.title AS book_name,
         array_length(ic.narrator_id_array, 1) AS chain_length,
         (SELECT n.name FROM narrators n WHERE n.id = ic.narrator_id_array[1] AND n.is_companion = true) AS companion_name,
         (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[2]) AS earliest_student_death,
         b.takhrij_death AS collector_death,
         CASE WHEN b.takhrij_death IS NOT NULL AND
                   (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1]) IS NOT NULL
              THEN b.takhrij_death - (SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[1])
              ELSE NULL END AS transmission_span,
         ARRAY(SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord) AS all_narrators,
         ARRAY(SELECT n.death_year_num FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord) AS all_deaths,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = $1 LIMIT 1) AS judgment_text
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = $1
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       ORDER BY
         COALESCE((SELECT n.death_year_num FROM narrators n WHERE n.id = ic.narrator_id_array[2]), 9999) ASC,
         b.takhrij_death ASC NULLS LAST
       LIMIT 25`,
      [hadithId]
    ).catch(() => ({ rows: [] as ChainTimestamp[] })),

    pool.query<BookEra>(
      `SELECT
         b.id AS book_id,
         b.title AS book_name,
         b.takhrij_death AS book_death,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         STRING_AGG(DISTINCT n.name, '،') FILTER (WHERE n.is_companion) AS companion_names
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = $1
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       JOIN narrators n ON n.id = ANY(ic.narrator_id_array)
       GROUP BY b.id, b.title, b.takhrij_death
       ORDER BY b.takhrij_death ASC NULLS LAST`,
      [hadithId]
    ).catch(() => ({ rows: [] as BookEra[] })),
  ])

  const hadith = hadithRes.rows[0]
  const chains = chainsRes.rows
  const bookTimeline = bookTimelineRes.rows

  const studentDeaths = chains.map(c => c.earliest_student_death).filter((d): d is number => d !== null && d < 9999)
  const minStudentDeath = studentDeaths.length ? Math.min(...studentDeaths) : null

  function eraLabel(year: number | null) {
    if (!year) return ''
    if (year <= 100) return 'ق1'
    if (year <= 200) return 'ق2'
    if (year <= 300) return 'ق3'
    if (year <= 400) return 'ق4'
    return 'ق5+'
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-700'
    if (/ضعيف/.test(j)) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
          <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث</Link>
          <span>←</span>
          <span>تاريخ الانتقال</span>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-1">تاريخ انتقال الحديث عبر القرون</h1>
        {hadith && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-sm text-gray-900 leading-relaxed mb-2">
            {hadith.text}{hadith.text?.length === 300 && '...'}
          </div>
        )}
      </div>

      {bookTimeline.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <h2 className="font-bold text-green-900 text-sm mb-3">متى سجل كل كتاب هذا الحديث؟</h2>
          <div className="space-y-3">
            {bookTimeline.map(bk => (
              <div key={bk.book_id} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-left">
                  {bk.book_death ? (
                    <div>
                      <span className="font-bold text-sm text-gray-700">{bk.book_death.toLocaleString('ar-EG')} هـ</span>
                      <span className="text-xs text-gray-400 mr-1">({eraLabel(bk.book_death)})</span>
                    </div>
                  ) : (
                    <span className="text-xs text-gray-400">؟</span>
                  )}
                </div>
                <div className="w-3 h-3 rounded-full bg-green-400 border-2 border-white shadow shrink-0" />
                <div className="flex-1">
                  <div className="font-medium text-sm text-green-900">{bk.book_name}</div>
                  <div className="text-xs text-gray-400">
                    {bk.chain_count} سند
                    {bk.companion_names && ` · عن: ${bk.companion_names}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {minStudentDeath && (
            <div className="mt-3 bg-blue-50 rounded-lg p-2.5 text-xs text-blue-800">
              اقدم تلميذ للصحابي في هذا الحديث: وفاة {minStudentDeath.toLocaleString('ar-EG')} هـ
            </div>
          )}
        </div>
      )}

      <h2 className="font-bold text-green-900 text-sm mb-3">
        الاسانيد مرتبة بالاقدم ({chains.length})
      </h2>
      <div className="space-y-3">
        {chains.map((chain, ci) => {
          const validDeaths = chain.all_deaths.filter((d): d is number => d !== null)
          const minDeath = validDeaths.length ? Math.min(...validDeaths) : null
          const maxDeath = validDeaths.length ? Math.max(...validDeaths) : null

          return (
            <div key={chain.chain_id} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className="text-xs text-gray-400">سند {(ci + 1).toLocaleString('ar-EG')}</span>
                <span className="text-xs font-medium text-gray-600">{chain.book_name}</span>
                {chain.judgment_text && (
                  <span className={`text-xs ${judgmentColor(chain.judgment_text)}`}>
                    {chain.judgment_text.slice(0, 35)}
                  </span>
                )}
                {chain.transmission_span !== null && (
                  <span className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 rounded-full mr-auto">
                    مدة السند {chain.transmission_span.toLocaleString('ar-EG')} سنة
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-1 items-center">
                {chain.all_narrators.map((name, ni) => {
                  const death = chain.all_deaths[ni]
                  return (
                    <div key={ni} className="flex items-center gap-1">
                      <div className={`text-xs px-2 py-1 rounded-lg border ${
                        ni === 0 ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-100 text-gray-700'
                      }`}>
                        <div className="font-medium">{name.split(' ').slice(0, 2).join(' ')}</div>
                        {death && <div className="opacity-60">ت {death.toLocaleString('ar-EG')}</div>}
                      </div>
                      {ni < chain.all_narrators.length - 1 && (
                        <span className="text-gray-300 text-xs shrink-0">←</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {minDeath && maxDeath && maxDeath > minDeath && (
                <div className="text-xs text-gray-400 mt-2">
                  المدى الزمني: {minDeath.toLocaleString('ar-EG')} - {maxDeath.toLocaleString('ar-EG')} هـ
                  ({(maxDeath - minDeath).toLocaleString('ar-EG')} سنة)
                </div>
              )}
            </div>
          )
        })}
      </div>

      {chains.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد بيانات زمنية كافية لاسانيد هذا الحديث
        </div>
      )}

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">تفاصيل الحديث ←</Link>
        <Link href={`/hadith/${hadithId}/chain-weakness`} className="text-red-600 hover:underline">الحلقات الضعيفة ←</Link>
        <Link href={`/hadith/${hadithId}/research-report`} className="text-blue-600 hover:underline">التقرير ←</Link>
      </div>
    </div>
  )
}
