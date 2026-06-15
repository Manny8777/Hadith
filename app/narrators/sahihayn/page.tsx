import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'رجال الصحيحين — جامع خادم الحرمين' }

// Grade mapping to a sortable tier
function gradeTier(grade: string | null): number {
  if (!grade) return 5
  if (/ثقة|ثبت|حجة|إمام|عدل/.test(grade)) return 1
  if (/صدوق|لا بأس|مقبول/.test(grade)) return 2
  if (/ضعيف|منكر/.test(grade)) return 4
  return 3
}

function gradeClass(grade: string | null): string {
  if (!grade) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (/ثقة|ثبت|حجة|إمام|عدل/.test(grade)) return 'bg-green-100 text-green-800 border-green-200'
  if (/صدوق|لا بأس|مقبول/.test(grade)) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (/ضعيف|منكر/.test(grade)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  tabaqa: string | null
  tabaqa_num: number | null
  death_year_num: number | null
  is_companion: boolean
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  in_bukhari: boolean
  in_muslim: boolean
  hadith_count: number | null
}

export default async function RijalSahihaynPage({
  searchParams,
}: {
  searchParams: Promise<{
    scope?: string  // 'both' | 'bukhari' | 'muslim'
    grade?: string
    tabaqa?: string
    page?: string
    sort?: string
  }>
}) {
  const sp = await searchParams
  const scope = (sp.scope || 'both') as 'both' | 'bukhari' | 'muslim'
  const gradeFilter = sp.grade || ''
  const tabaqaFilter = sp.tabaqa || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const sort = sp.sort || 'tabaqa'
  const limit = 60
  const offset = (pg - 1) * limit

  // Get Bukhari and Muslim IDs from DB
  const bookRes = await pool.query<{ id: number; title: string }>(
    `SELECT id, title FROM books
     WHERE title ILIKE '%صحيح البخاري%' OR title ILIKE '%صحيح مسلم%'
     ORDER BY title`
  ).catch(() => ({ rows: [] as { id: number; title: string }[] }))

  const bukhariId = bookRes.rows.find(b => b.title.includes('البخاري'))?.id
  const muslimId = bookRes.rows.find(b => b.title.includes('مسلم'))?.id

  if (!bukhariId || !muslimId) {
    return (
      <div dir="rtl" className="p-8 text-center text-gray-500">
        تعذر تحديد كتابَي الصحيحين في قاعدة البيانات
      </div>
    )
  }

  // Scope filter
  const scopeClause =
    scope === 'both'
      ? `EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${bukhariId})
         AND EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${muslimId})`
      : scope === 'bukhari'
      ? `EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${bukhariId})
         AND NOT EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${muslimId})`
      : `EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${muslimId})
         AND NOT EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${bukhariId})`

  const gradeClause = gradeFilter
    ? `AND (n.martaba_ibn_hajar ILIKE $${1} OR n.martaba_zahabi ILIKE $${1})`
    : ''
  const tabaqaClause = tabaqaFilter ? `AND n.tabaqa_num = $${gradeFilter ? 2 : 1}` : ''

  const params: (string | number)[] = []
  if (gradeFilter) params.push(`%${gradeFilter}%`)
  if (tabaqaFilter) params.push(parseInt(tabaqaFilter))

  const countParams = [...params]
  const dataParams = [...params, limit, offset]

  const orderClause =
    sort === 'death'
      ? 'n.death_year_num ASC NULLS LAST, n.name'
      : sort === 'name'
      ? 'n.name'
      : sort === 'grade'
      ? `CASE WHEN n.martaba_ibn_hajar ~* 'ثقة|ثبت|حجة' THEN 1 WHEN n.martaba_ibn_hajar ~* 'صدوق|لا بأس' THEN 2 ELSE 3 END, n.tabaqa_num NULLS LAST`
      : 'n.tabaqa_num NULLS LAST, n.death_year_num NULLS LAST'

  const baseWhere = `WHERE ${scopeClause} ${gradeClause} ${tabaqaClause}`

  const [narratorsRes, countRes, tabaqaListRes] = await Promise.all([
    pool.query<NarratorRow>(
      `SELECT n.id, n.name, n.abb_name, n.tabaqa, n.tabaqa_num,
              n.death_year_num, n.is_companion,
              n.martaba_ibn_hajar, n.martaba_zahabi, n.hadiths_count,
              EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${bukhariId}) AS in_bukhari,
              EXISTS (SELECT 1 FROM narrator_books WHERE narrator_id = n.id AND book_id = ${muslimId}) AS in_muslim
       FROM narrators n
       ${baseWhere}
       ORDER BY ${orderClause}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams
    ).catch(() => ({ rows: [] as NarratorRow[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt FROM narrators n ${baseWhere}`,
      countParams
    ).catch(() => ({ rows: [{ cnt: 0 }] })),

    pool.query<{ tabaqa: string; tabaqa_num: number; cnt: number }>(
      `SELECT n.tabaqa, n.tabaqa_num, COUNT(*)::int AS cnt
       FROM narrators n
       WHERE ${scopeClause}
       GROUP BY n.tabaqa, n.tabaqa_num
       ORDER BY n.tabaqa_num NULLS LAST`
    ).catch(() => ({ rows: [] as { tabaqa: string; tabaqa_num: number; cnt: number }[] })),
  ])

  const narrators = narratorsRes.rows
  const total = countRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const tabaqas = tabaqaListRes.rows

  const scopeLabels = {
    both: 'في الصحيحين معاً',
    bukhari: 'في البخاري فقط',
    muslim: 'في مسلم فقط',
  }

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (scope !== 'both') p.set('scope', scope)
    if (gradeFilter) p.set('grade', gradeFilter)
    if (tabaqaFilter) p.set('tabaqa', tabaqaFilter)
    if (sort !== 'tabaqa') p.set('sort', sort)
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v)
      else p.delete(k)
    })
    const str = p.toString()
    return `/narrators/sahihayn${str ? '?' + str : ''}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">رجال الصحيحين</h1>
        <p className="text-sm text-gray-500">
          الرواة الذين احتج بهم الشيخان (البخاري ومسلم) في صحيحيهما — من أهم مباحث علم الرجال
        </p>
      </div>

      {/* Scope selector */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(['both', 'bukhari', 'muslim'] as const).map(s => (
          <Link
            key={s}
            href={buildUrl({ scope: s === 'both' ? '' : s, page: '' })}
            className={`text-xs px-4 py-2 rounded-xl border font-medium transition-colors ${
              scope === s
                ? 'bg-green-800 text-white border-green-800'
                : 'bg-white text-green-800 border-green-200 hover:border-green-400'
            }`}
          >
            {scopeLabels[s]}
          </Link>
        ))}
        <span className="text-xs text-gray-400 mr-2">
          {total.toLocaleString('ar-EG')} راوٍ
        </span>
      </div>

      {/* Filters row */}
      <div className="flex items-center gap-3 mb-4 flex-wrap text-xs">
        <span className="text-gray-500">الترتيب:</span>
        {[
          { key: 'tabaqa', label: 'الطبقة' },
          { key: 'death', label: 'سنة الوفاة' },
          { key: 'name', label: 'الاسم' },
          { key: 'grade', label: 'الدرجة' },
        ].map(s => (
          <Link key={s.key} href={buildUrl({ sort: s.key === 'tabaqa' ? '' : s.key, page: '' })}
            className={`px-3 py-1 rounded-full border transition-colors ${
              sort === s.key ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            {s.label}
          </Link>
        ))}

        {/* Grade filter as links */}
        {['ثقة', 'صدوق', 'ضعيف'].map(g => (
          <Link key={g} href={buildUrl({ grade: gradeFilter === g ? '' : g, page: '' })}
            className={`px-3 py-1 rounded-full border transition-colors ${
              gradeFilter === g ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
            }`}>
            {g}
          </Link>
        ))}
      </div>

      {/* Tabaqa quick filter */}
      {tabaqas.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-4">
          <span className="text-xs text-gray-400 ml-2">الطبقة:</span>
          <Link href={buildUrl({ tabaqa: '', page: '' })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !tabaqaFilter ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            الكل
          </Link>
          {tabaqas.slice(0, 12).map(t => (
            <Link key={t.tabaqa_num} href={buildUrl({ tabaqa: String(t.tabaqa_num), page: '' })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                tabaqaFilter === String(t.tabaqa_num) ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
              title={t.tabaqa}>
              ط{t.tabaqa_num} <span className="opacity-60">({t.cnt})</span>
            </Link>
          ))}
        </div>
      )}

      {/* Narrators grid */}
      <div className="grid gap-2 grid-cols-1">
        {narrators.map(n => (
          <Link
            key={n.id}
            href={`/narrator/${n.id}`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group"
          >
            {/* Book badges */}
            <div className="flex flex-col gap-1 shrink-0">
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium text-center ${
                n.in_bukhari ? 'bg-green-100 text-green-800' : 'bg-gray-50 text-gray-300'
              }`} title="البخاري">خ</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium text-center ${
                n.in_muslim ? 'bg-blue-100 text-blue-800' : 'bg-gray-50 text-gray-300'
              }`} title="مسلم">م</span>
            </div>

            {/* Main info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-green-900 text-sm group-hover:underline">
                  {n.abb_name || n.name}
                </span>
                {n.is_companion && (
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">صحابي</span>
                )}
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full border ${gradeClass(n.martaba_ibn_hajar)}`}>
                    {n.martaba_ibn_hajar.split('،')[0].trim().slice(0, 20)}
                  </span>
                )}
              </div>
              {(n.tabaqa || n.death_year_num) && (
                <div className="flex items-center gap-3 mt-0.5">
                  {n.tabaqa && <span className="text-xs text-gray-400">{n.tabaqa}</span>}
                  {n.death_year_num && <span className="text-xs text-gray-400">ت {n.death_year_num}</span>}
                </div>
              )}
            </div>

            {/* Hadith count */}
            {n.hadith_count && (
              <span className="text-xs text-gray-400 shrink-0">
                {n.hadith_count.toLocaleString('ar-EG')} ح
              </span>
            )}
          </Link>
        ))}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا يوجد رواة بهذا الفلتر
        </div>
      )}

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
        <span className="flex items-center gap-1">
          <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded font-medium">خ</span>
          في البخاري
        </span>
        <span className="flex items-center gap-1">
          <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">م</span>
          في مسلم
        </span>
        <span className="text-gray-300">|</span>
        <span>يُقصد بذلك الرواة المُدرَجون في فهرس رجال الكتاب (narrator_books)</span>
      </div>

      {/* Pagination */}
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

      {/* Research note */}
      <div className="mt-6 bg-blue-50 border border-blue-100 rounded-xl p-4 text-xs text-blue-800">
        <p className="font-semibold mb-1">ملاحظة منهجية</p>
        <p>
          "رجال الصحيحين" يُعنى في الاصطلاح بمن احتج بهم الشيخان في أصل الصحيح — ويتميزون عمن
          روى عنهم في المتابعات والشواهد. وقد اعتمد هذا الفهرس على مرويات كل راوٍ في الكتابين
          وفق بيانات قاعدة البيانات، ويُنصح بمراجعة كتب "تهذيب الكمال" و"تهذيب التهذيب" للتدقيق.
        </p>
      </div>

      {/* Quick nav */}
      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← الطبقات</Link>
        <Link href="/narrators/compare" className="text-green-700 hover:underline">← مقارنة الرواة</Link>
      </div>
    </div>
  )
}
