import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الرواة غير المُقيَّمين — جامع خادم الحرمين' }

interface UnratedRow {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  tabaqa: string | null
  death_year: string | null
  death_year_num: number | null
  hadiths_count: number
  chain_count: number
  is_companion: boolean
  has_opinions: boolean
}

export default async function UnratedNarratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string; min_hadiths?: string; page?: string; tab?: string }>
}) {
  const sp = await searchParams
  const sort = sp.sort || 'chain_count'
  const minHadiths = Math.max(1, parseInt(sp.min_hadiths || '1'))
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 50
  const offset = (page - 1) * limit
  const tab = sp.tab || 'no_grade'

  const orderBy =
    sort === 'hadiths' ? 'chain_count DESC, n.hadiths_count DESC' :
    sort === 'death' ? 'n.death_year_num ASC NULLS LAST, chain_count DESC' :
    sort === 'name' ? 'n.name ASC' :
    'chain_count DESC, n.hadiths_count DESC'

  // Tab: no_grade = martaba_ibn_hajar IS NULL; no_opinions = no rows in narrator_criticism
  const gradeClause = tab === 'no_grade'
    ? 'AND n.martaba_ibn_hajar IS NULL'
    : ''

  const opinionClause = tab === 'no_opinions'
    ? `AND NOT EXISTS (
         SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = n.id
       )`
    : tab === 'no_grade'
    ? ''
    : ''

  const whereExtra = tab === 'no_grade'
    ? gradeClause
    : tab === 'no_opinions'
    ? opinionClause
    : 'AND n.martaba_ibn_hajar IS NULL AND NOT EXISTS (SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = n.id)'

  const params: (string | number)[] = [minHadiths]
  const countParams: (string | number)[] = [minHadiths]

  const [rowsRes, countRes, tabCountRes] = await Promise.all([
    pool.query<UnratedRow>(
      `SELECT n.id, n.name, n.abb_name, n.kunia, n.tabaqa, n.death_year_num AS death_year, n.death_year_num,
              n.hadiths_count, n.hadiths_count AS chain_count, n.is_companion,
              EXISTS (SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = n.id) AS has_opinions
       FROM narrators n
       WHERE n.is_companion = false
         AND n.hadiths_count >= $1
         ${whereExtra}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      params
    ).catch(() => ({ rows: [] as UnratedRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total
       FROM narrators n
       WHERE n.is_companion = false
         AND n.hadiths_count >= $1
         ${whereExtra}`,
      countParams
    ).catch(() => ({ rows: [{ total: 0 }] })),

    pool.query<{ tab: string; cnt: number }>(
      `SELECT
         SUM(CASE WHEN n.martaba_ibn_hajar IS NULL THEN 1 ELSE 0 END)::int AS no_grade,
         SUM(CASE WHEN NOT EXISTS (SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = n.id) THEN 1 ELSE 0 END)::int AS no_opinions,
         SUM(CASE WHEN n.martaba_ibn_hajar IS NULL
                    AND NOT EXISTS (SELECT 1 FROM narrator_criticism nc WHERE nc.narrator_id = n.id) THEN 1 ELSE 0 END)::int AS neither
       FROM narrators n
       WHERE n.is_companion = false AND n.hadiths_count >= 1`,
      []
    ).catch(() => ({ rows: [] as any[] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)
  const tabCounts = tabCountRes.rows[0] || {}

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('sort', sort)
    p.set('min_hadiths', String(minHadiths))
    p.set('page', String(page))
    p.set('tab', tab)
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/unrated?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة غير المُقيَّمين</h1>
        <p className="text-sm text-gray-500 mb-3">
          رواة وردوا في الأسانيد ولم يُقيَّموا في مصادر الجرح والتعديل المتاحة — يحتاجون إلى دراسة وبحث
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">أهمية بحثية: </span>
          الراوي المجهول الحال (المستور) لا يُحتج بحديثه حتى يُعرف عدله — تحديد هؤلاء الرواة خطوة ضرورية في البحث الحديثي.
          يشمل هذا الفهرس من لم يُذكر في طبقات ابن حجر أو لم يَصدر فيه حكم من علماء الجرح والتعديل.
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {[
            { key: 'no_grade', label: 'بلا درجة من ابن حجر', count: tabCounts.no_grade },
            { key: 'no_opinions', label: 'بلا أقوال في الجرح والتعديل', count: tabCounts.no_opinions },
            { key: 'both', label: 'بلا درجة ولا أقوال', count: tabCounts.neither },
          ].map(t => (
            <Link key={t.key} href={buildUrl({ tab: t.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 ${
                tab === t.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {t.label}
              {t.count != null && (
                <span className={`text-xs rounded-full px-1.5 ${
                  tab === t.key ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{t.count?.toLocaleString('ar-EG')}</span>
              )}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">أدنى حد:</span>
            {[1, 5, 10, 25, 50].map(n => (
              <Link key={n} href={buildUrl({ min_hadiths: String(n), page: '1' })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  minHadiths === n
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}>
                {n}+ حديث
              </Link>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">ترتيب:</span>
            {[
              { key: 'chain_count', label: 'عدد الأحاديث' },
              { key: 'death', label: 'الوفاة' },
              { key: 'name', label: 'الاسم' },
            ].map(s => (
              <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  sort === s.key
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
                }`}>
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="text-xs text-gray-400">
          إجمالي: {total.toLocaleString('ar-EG')} راوٍ — صفحة {page.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.id}
            className="bg-white rounded-xl border border-gray-100 p-3 hover:border-amber-200 hover:shadow-sm transition-all flex items-center gap-3">
            <span className="text-xs text-gray-300 w-6 shrink-0">
              {(offset + idx + 1).toLocaleString('ar-EG')}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/narrator/${r.id}`}
                  className="text-sm font-bold text-green-900 hover:underline">
                  {r.name}
                </Link>
                {r.kunia && <span className="text-xs text-gray-400">{r.kunia}</span>}
                {r.tabaqa && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                    {r.tabaqa}
                  </span>
                )}
                {r.death_year && (
                  <span className="text-xs text-gray-400">ت {r.death_year}</span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                {!r.has_opinions && (
                  <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                    لا أقوال في الجرح والتعديل
                  </span>
                )}
                {r.has_opinions && (
                  <Link href={`/narrator/${r.id}/criticism-history`}
                    className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full hover:bg-amber-100 transition-colors">
                    أقوال العلماء ←
                  </Link>
                )}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-sm font-bold text-gray-700">
                {r.hadiths_count?.toLocaleString('ar-EG') || '—'}
              </div>
              <div className="text-xs text-gray-400">حديث</div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400 transition-colors">
              ← السابق
            </Link>
          )}
          {[...Array(Math.min(5, totalPages))].map((_, i) => {
            const pg = Math.max(1, page - 2) + i
            if (pg > totalPages) return null
            return (
              <Link key={pg} href={buildUrl({ page: String(pg) })}
                className={`text-xs w-8 h-8 flex items-center justify-center rounded-lg border transition-colors ${
                  pg === page ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 hover:border-green-400'
                }`}>
                {pg.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400 transition-colors">
              التالي ←
            </Link>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/contested" className="text-green-700 hover:underline">← المختلف فيهم</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح</Link>
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
      </div>
    </div>
  )
}
