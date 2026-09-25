import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface OpeningGroup {
  opening: string
  hadith_count: number
  book_count: number
  companion_count: number
  grade_mix: string | null
  sample_id: number
}

interface VariantHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  companion_name: string | null
  judgment_text: string | null
  chain_count: number
}

const POPULAR_OPENINGS = [
  { label: 'إنما الأعمال', pattern: '^إنما الأعمال' },
  { label: 'من كذب علي', pattern: '^من كذب عل' },
  { label: 'بُني الإسلام', pattern: '^بُني الإسلام|^بني الإسلام' },
  { label: 'الحلال بيِّن', pattern: '^الحلال بيِّن|^الحلال بين' },
  { label: 'من سلك طريقاً', pattern: '^من سلك طريق' },
  { label: 'لا يؤمن أحدكم', pattern: '^لا يؤمن أحد' },
  { label: 'المسلم أخو', pattern: '^المسلم أخو' },
  { label: 'كل أمر ذي بال', pattern: '^كل أمر ذي بال|^كل أمر لا يُبدأ' },
]

export default async function OpeningVariantsPage({
  searchParams,
}: {
  searchParams: Promise<{ opening?: string; q?: string; page?: string }>
}) {
  const sp = await searchParams
  const opening = sp.opening || ''
  const q = sp.q || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 25
  const offset = (page - 1) * pageSize

  const activePattern = opening || q

  const [topOpeningsRes, variantsRes] = await Promise.all([
    !activePattern ? pool.query<OpeningGroup>(
      `SELECT
         REGEXP_REPLACE(LEFT(ht.tarf, 30), '[^\\u0600-\\u06FF ]+', '', 'g') AS opening,
         COUNT(DISTINCT ht.main_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         COUNT(DISTINCT ic.narrator_id_array[1])
           FILTER (WHERE (SELECT is_companion FROM narrators WHERE id = ic.narrator_id_array[1]))::int AS companion_count,
         STRING_AGG(DISTINCT
           CASE
             WHEN hj.say_text ~* 'صحيح' THEN 'صحيح'
             WHEN hj.say_text ~* 'حسن' THEN 'حسن'
             WHEN hj.say_text ~* 'ضعيف' THEN 'ضعيف'
             ELSE NULL
           END, '/' ORDER BY CASE WHEN hj.say_text ~* 'صحيح' THEN 1 WHEN hj.say_text ~* 'حسن' THEN 2 ELSE 3 END
         ) AS grade_mix,
         MIN(ht.main_id) AS sample_id
       FROM hadith_toc ht
       LEFT JOIN isnad_chains ic ON ic.id IN (
         SELECT ih.isnad_id FROM isnad_hadiths ih WHERE ih.hadith_id = ht.main_id LIMIT 1
       )
       LEFT JOIN hadith_judgments hj ON hj.hadith_id = ht.main_id
       WHERE ht.tarf IS NOT NULL AND LENGTH(ht.tarf) > 10
       GROUP BY REGEXP_REPLACE(LEFT(ht.tarf, 30), '[^\\u0600-\\u06FF ]+', '', 'g')
       HAVING COUNT(DISTINCT ht.main_id) >= 3
       ORDER BY COUNT(DISTINCT ht.book_id) DESC, COUNT(DISTINCT ht.main_id) DESC
       LIMIT 40`,
      []
    ).catch(() => ({ rows: [] as OpeningGroup[] })) : Promise.resolve({ rows: [] as OpeningGroup[] }),

    activePattern ? pool.query<VariantHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 260) AS hadith_text,
         b.title AS book_name,
         (SELECT n.name FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
          JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
          LIMIT 1) AS companion_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic2.id)::int FROM isnad_chains ic2
          JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id WHERE ih2.hadith_id = ht.main_id) AS chain_count
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.tarf ~* $1
       ORDER BY ht.book_id, ht.main_id
       LIMIT $2 OFFSET $3`,
      [activePattern, pageSize, offset]
    ).catch(() => ({ rows: [] as VariantHadith[] })) : Promise.resolve({ rows: [] as VariantHadith[] }),
  ])

  const topOpenings = topOpeningsRes.rows
  const variants = variantsRes.rows

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  function gradeMixColor(mix: string | null) {
    if (!mix) return 'text-gray-300'
    if (mix === 'صحيح') return 'text-green-600'
    if (mix === 'ضعيف') return 'text-red-500'
    if (mix.includes('صحيح') && mix.includes('ضعيف')) return 'text-amber-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الروايات المتشابهة في المتن — تحليل الفواتح</h1>
        <p className="text-sm text-gray-500">
          يجمع الأحاديث التي تبدأ بنفس العبارة ليكشف الروايات المختلفة لنفس المتن — أداة لدراسة الاختلاف في الألفاظ بين كتب الحديث
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
        <form method="get" action="/hadiths/opening-variants" className="flex gap-2">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="ابحث بداية الحديث — مثل: إنما الأعمال"
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400"
            dir="rtl"
          />
          <button type="submit"
            className="bg-green-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-800 transition-colors">
            بحث
          </button>
          {(q || opening) && (
            <a href="/hadiths/opening-variants"
              className="text-sm border border-gray-200 px-4 py-2 rounded-lg hover:border-red-300 text-gray-500">
              ✕
            </a>
          )}
        </form>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        {POPULAR_OPENINGS.map(po => (
          <a key={po.label}
            href={`/hadiths/opening-variants?opening=${encodeURIComponent(po.pattern)}`}
            className={`text-xs px-3 py-1.5 border rounded-full transition-all ${opening === po.pattern ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {po.label}
          </a>
        ))}
      </div>

      {!activePattern ? (
        <>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              أكثر الفواتح انتشاراً عبر الكتب — اضغط للاستعراض
            </div>
            <div className="divide-y divide-gray-50">
              {topOpenings.map((o, i) => (
                <a key={i}
                  href={`/hadiths/opening-variants?opening=${encodeURIComponent('^' + o.opening.trim())}`}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-green-50 transition-colors group">
                  <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-green-900 group-hover:text-green-700">
                      {o.opening.trim()}...
                    </span>
                    <div className="flex gap-3 text-xs mt-1 flex-wrap">
                      <span className="text-gray-500">{o.hadith_count} نص</span>
                      <span className="text-blue-600">{o.book_count} كتاب</span>
                      {o.companion_count > 0 && (
                        <span className="text-amber-600">{o.companion_count} صحابي</span>
                      )}
                      {o.grade_mix && (
                        <span className={gradeMixColor(o.grade_mix)}>{o.grade_mix}</span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-green-600 shrink-0 font-medium">{o.book_count} كتاب ←</span>
                </a>
              ))}
            </div>
          </div>

          {topOpenings.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              جارٍ تحميل البيانات...
            </div>
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2">
            <span className="text-sm text-gray-600 font-medium">النتائج لـ:</span>
            <span className="text-sm text-green-800 bg-green-50 px-3 py-1 rounded-full border border-green-100">
              {activePattern.replace(/\^/, '').replace(/\|.+/, '')}
            </span>
            <span className="text-xs text-gray-400">({variants.length} رواية)</span>
          </div>

          <div className="space-y-2">
            {variants.map(v => (
              <div key={v.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
                <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
                  <span className="text-gray-600 font-medium">{v.book_name}</span>
                  {v.companion_name && (
                    <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                      {v.companion_name.split(' ').slice(0, 2).join(' ')}
                    </span>
                  )}
                  {v.judgment_text && (
                    <span className={judgmentColor(v.judgment_text)}>{v.judgment_text.slice(0, 25)}</span>
                  )}
                  <span className="text-gray-300 mr-auto">{v.chain_count} سند</span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">{v.hadith_text}...</p>
                <div className="flex gap-3 text-xs">
                  <Link href={`/hadith/${v.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${v.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                </div>
              </div>
            ))}

            {variants.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد روايات لهذه العبارة في قاعدة البيانات
              </div>
            )}
          </div>

          {(variants.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && (
                <a href={`/hadiths/opening-variants?${opening ? `opening=${encodeURIComponent(opening)}` : `q=${encodeURIComponent(q)}`}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {variants.length === pageSize && (
                <a href={`/hadiths/opening-variants?${opening ? `opening=${encodeURIComponent(opening)}` : `q=${encodeURIComponent(q)}`}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/matn-keywords" className="text-green-700 hover:underline">← الأحاديث الموضوعية</Link>
        <Link href="/hadiths/divergent-judgments" className="text-green-700 hover:underline">← اختلاف العلماء</Link>
        <Link href="/search" className="text-green-700 hover:underline">← البحث في الحديث</Link>
      </div>
    </div>
  )
}
