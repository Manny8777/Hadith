import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'نشاط علماء الجرح والتعديل — جامع خادم الحرمين' }

interface ScholarActivity {
  scientist_name: string
  scientist_noun_id: number | null
  total_opinions: number
  praise_count: number
  criticism_count: number
  neutral_count: number
  death_year: string | null
  death_year_num: number | null
  tabaqa: string | null
}

function praiseBarWidth(p: number, t: number) {
  return t > 0 ? (p / t) * 100 : 0
}

function criticBarWidth(c: number, t: number) {
  return t > 0 ? (c / t) * 100 : 0
}

export default async function ScholarsActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; page?: string; era?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'total'
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const era = sp.era || ''
  const limit = 50
  const offset = (pg - 1) * limit

  const orderBy =
    sort === 'praise' ? 'praise_count DESC' :
    sort === 'criticism' ? 'criticism_count DESC' :
    sort === 'death' ? 'death_year_num ASC NULLS LAST' :
    'total_opinions DESC'

  // eraFilter removed: narrator_criticism has no death_year and scientist_noun_id does not exist
  const eraFilter = ''

  const [resultsRes, totalRes] = await Promise.all([
    pool.query<ScholarActivity>(
      `SELECT nc.scientist_name,
              NULL::int AS scientist_noun_id,
              COUNT(*)::int AS total_opinions,
              SUM(CASE WHEN nc.say_text ~* 'ثقة|ثبت|حافظ|عدل|صدوق|مستقيم|لا بأس به|جيد الحديث|خير|أمين|محتج به' THEN 1 ELSE 0 END)::int AS praise_count,
              SUM(CASE WHEN nc.say_text ~* 'ضعيف|منكر|متروك|موضوع|كذاب|مجهول|سيء الحفظ|كثير الخطأ|ليس بشيء|ليس بثقة|واهٍ|واه' THEN 1 ELSE 0 END)::int AS criticism_count,
              SUM(CASE WHEN nc.say_text !~* 'ثقة|ثبت|حافظ|عدل|صدوق|مستقيم|لا بأس به|جيد الحديث|خير|أمين|محتج به|ضعيف|منكر|متروك|موضوع|كذاب|مجهول|سيء الحفظ|كثير الخطأ|ليس بشيء|ليس بثقة|واهٍ|واه' THEN 1 ELSE 0 END)::int AS neutral_count,
              NULL AS death_year, NULL::int AS death_year_num, NULL AS tabaqa
       FROM narrator_criticism nc
       WHERE nc.scientist_name IS NOT NULL AND nc.scientist_name != ''
         AND nc.say_text IS NOT NULL AND nc.say_text != ''
         ${eraFilter}
       GROUP BY nc.scientist_name
       HAVING COUNT(*) >= 10
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      []
    ).catch(() => ({ rows: [] as ScholarActivity[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT nc.scientist_name
         FROM narrator_criticism nc
         WHERE nc.scientist_name IS NOT NULL AND nc.scientist_name != ''
           AND nc.say_text IS NOT NULL AND nc.say_text != ''
           ${eraFilter}
         GROUP BY nc.scientist_name
         HAVING COUNT(*) >= 10
       ) sub`,
      []
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const results = resultsRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const maxOpinions = results[0]?.total_opinions || 1

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('page', '1')
    if (era) p.set('era', era)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/scholars/activity?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">نشاط علماء الجرح والتعديل</h1>
        <p className="text-sm text-gray-500 mb-3">
          ترتيب العلماء بعدد آرائهم في الرواة — يكشف عن أكثر النقاد إنتاجاً وأشدهم أثراً في التراث الحديثي
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">معلومة بحثية: </span>
          يُعدّ ابن معين وابن أبي حاتم من أكثر المحدثين نقداً للرواة؛ ومن المعروف أن نقد ابن معين يميل إلى الشدة
          في حين كان أحمد بن حنبل أكثر توسعاً. وتتجلى هذه الفوارق هنا في نسبة الجرح إلى التعديل لكل عالم.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحقبة:</span>
          {[
            { key: '', label: 'الجميع' },
            { key: 'early', label: 'قبل 300هـ' },
            { key: 'mid', label: '300-450هـ' },
            { key: 'late', label: 'بعد 450هـ' },
          ].map(e => (
            <Link key={e.key} href={buildUrl({ era: e.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                era === e.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {e.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'total', label: 'مجموع الآراء' },
            { key: 'praise', label: 'أكثر توثيقاً' },
            { key: 'criticism', label: 'أشد جرحاً' },
            { key: 'death', label: 'تاريخياً' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} عالم</span>
        </div>
      </div>

      <div className="space-y-3">
        {results.map((r, idx) => {
          const pWidth = praiseBarWidth(r.praise_count, r.total_opinions)
          const cWidth = criticBarWidth(r.criticism_count, r.total_opinions)
          const sizeRatio = (r.total_opinions / maxOpinions) * 100

          return (
            <div key={`${r.scientist_name}-${idx}`}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-300 tabular-nums">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                    {r.scientist_noun_id ? (
                      <>
                        <Link href={`/narrator/${r.scientist_noun_id}`}
                          className="font-bold text-green-900 hover:text-green-700 hover:underline">
                          {r.scientist_name}
                        </Link>
                        <Link href={`/scholar/${r.scientist_noun_id}`}
                          className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full hover:bg-indigo-100 transition-colors">
                          أحكامه ←
                        </Link>
                      </>
                    ) : (
                      <span className="font-bold text-green-900">{r.scientist_name}</span>
                    )}
                    {r.tabaqa && (
                      <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{r.tabaqa}</span>
                    )}
                    {r.death_year && (
                      <span className="text-xs text-gray-400">ت {r.death_year}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-center">
                  <div>
                    <div className="text-sm font-bold text-gray-800">{r.total_opinions.toLocaleString('ar-EG')}</div>
                    <div className="text-xs text-gray-400">إجمالي</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-green-600">{r.praise_count.toLocaleString('ar-EG')}</div>
                    <div className="text-xs text-gray-400">تعديل</div>
                  </div>
                  <div>
                    <div className="text-sm font-bold text-red-500">{r.criticism_count.toLocaleString('ar-EG')}</div>
                    <div className="text-xs text-gray-400">جرح</div>
                  </div>
                </div>
              </div>

              {/* Volume bar */}
              <div className="mb-1">
                <div className="bg-gray-100 rounded-full h-1.5 overflow-hidden mb-1" title="حجم النشاط نسبياً">
                  <div className="bg-gray-400 h-1.5 rounded-full" style={{ width: `${sizeRatio}%` }} />
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-green-600 w-8 text-right">{Math.round(pWidth)}%</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden flex bg-gray-100">
                    <div className="bg-green-400 h-2" style={{ width: `${pWidth}%` }} />
                    <div className="bg-red-300 h-2" style={{ width: `${cWidth}%` }} />
                  </div>
                  <span className="text-xs text-red-500 w-8">{Math.round(cWidth)}%</span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mt-0.5">
                  <span>تعديل</span>
                  {r.neutral_count > 0 && <span className="text-center">{r.neutral_count} محايد</span>}
                  <span>جرح</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {results.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl({ page: String(pg - 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(pg - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link key={p} href={buildUrl({ page: String(p) })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl({ page: String(pg + 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/scholars/disagreements" className="text-green-700 hover:underline">← خلاف المحدثين</Link>
        <Link href="/narrators/contested" className="text-green-700 hover:underline">← المختلف فيهم</Link>
      </div>
    </div>
  )
}
