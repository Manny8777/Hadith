import Link from 'next/link'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

interface Narrator {
  id: number
  name: string
  abb_name: string | null
  death_year_num: number | null
  hadiths_count: number | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
  is_mobham: boolean
  tabaqa: string | null
}

interface SearchParams {
  q?: string
  grade?: string
  companion?: string
  tabaqa?: string
  sort?: string
  page?: string
  death_min?: string
  death_max?: string
  filter?: string
}

const GRADE_FILTERS = [
  { label: 'ثقة', pattern: 'ثقة' },
  { label: 'صدوق', pattern: 'صدوق' },
  { label: 'ضعيف', pattern: 'ضعيف' },
  { label: 'مجهول', pattern: 'مجهول' },
]

const TABAQA_FILTERS = [
  { label: 'الثانية', desc: 'كبار التابعين' },
  { label: 'الثالثة', desc: 'وسطى التابعين' },
  { label: 'الرابعة', desc: 'أتباع التابعين' },
  { label: 'الخامسة', desc: 'الطبقة الخامسة' },
  { label: 'السادسة', desc: 'الطبقة السادسة' },
  { label: 'السابعة', desc: 'الطبقة السابعة' },
  { label: 'الثامنة', desc: 'الطبقة الثامنة' },
  { label: 'التاسعة', desc: 'الطبقة التاسعة' },
  { label: 'العاشرة', desc: 'الطبقة العاشرة' },
]

// Quick-filter options driven by the new boolean fields
const QUICK_FILTERS = [
  { key: 'companions', label: 'الصحابة فقط', color: 'amber' },
  { key: 'scientists', label: 'العلماء الناقدون', color: 'blue' },
  { key: 'mobham', label: 'المبهمون', color: 'gray' },
  { key: 'unrated', label: 'بدون تقييم', color: 'rose' },
] as const

export default async function NarratorsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const q = sp.q ?? ''
  const gradeFilter = sp.grade ?? ''
  const companionFilter = sp.companion === '1'
  const tabaqaFilter = sp.tabaqa ?? ''
  const sortBy = sp.sort ?? 'hadiths'
  const page = Math.max(1, parseInt(sp.page ?? '1', 10))
  const deathMin = sp.death_min ? parseInt(sp.death_min, 10) : null
  const deathMax = sp.death_max ? parseInt(sp.death_max, 10) : null
  const quickFilter = sp.filter ?? ''   // companions | scientists | mobham | unrated
  const limit = 40
  const offset = (page - 1) * limit

  // Build WHERE conditions
  const conditions: string[] = []
  const queryParams: (string | boolean | number)[] = []
  let pi = 1

  if (q.trim()) {
    conditions.push(`(name_normalized ILIKE normalize_arabic($${pi}) OR name ILIKE $${pi} OR abb_name ILIKE $${pi} OR kunia ILIKE $${pi})`)
    queryParams.push(`%${q.trim()}%`)
    pi++
  }
  if (companionFilter) {
    conditions.push(`is_companion = true`)
  }
  if (gradeFilter) {
    conditions.push(`(martaba_ibn_hajar ILIKE $${pi} OR martaba_zahabi ILIKE $${pi})`)
    queryParams.push(`%${gradeFilter}%`)
    pi++
  }
  if (tabaqaFilter) {
    conditions.push(`tabaqa ILIKE $${pi}`)
    queryParams.push(`%${tabaqaFilter}%`)
    pi++
  }
  if (deathMin !== null && !isNaN(deathMin)) {
    conditions.push(`death_year_num >= $${pi}`)
    queryParams.push(deathMin)
    pi++
  }
  if (deathMax !== null && !isNaN(deathMax)) {
    conditions.push(`death_year_num <= $${pi}`)
    queryParams.push(deathMax)
    pi++
  }
  // Quick filters (new boolean fields)
  if (quickFilter === 'companions') {
    conditions.push(`is_companion = true`)
  } else if (quickFilter === 'scientists') {
    conditions.push(`is_scientist = true`)
  } else if (quickFilter === 'mobham') {
    conditions.push(`is_mobham = true`)
  } else if (quickFilter === 'unrated') {
    conditions.push(`martaba_ibn_hajar IS NULL AND martaba_zahabi IS NULL`)
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

  const orderClause =
    sortBy === 'death' ? 'death_year_num ASC NULLS LAST, name' :
    sortBy === 'name' ? 'name' :
    'hadiths_count DESC NULLS LAST, name'

  let narrators: Narrator[] = []
  let total = 0

  // Stats for banner (run once regardless of current filter)
  let statsTotal = 0
  let statsCompanions = 0
  let statsScientists = 0
  let statsMobham = 0

  try {
    const [countRes, dataRes, statsRes] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM narrators ${where}`, queryParams),
      pool.query<Narrator>(
        `SELECT id, name, abb_name, death_year_num, hadiths_count,
                martaba_ibn_hajar, martaba_zahabi, is_companion, is_mobham, tabaqa
         FROM narrators ${where}
         ORDER BY ${orderClause}
         LIMIT $${pi} OFFSET $${pi + 1}`,
        [...queryParams, limit, offset]
      ),
      pool.query<{ total: string; companions: string; scientists: string; mobham: string }>(`
        SELECT
          COUNT(*)                                    AS total,
          COUNT(*) FILTER (WHERE is_companion = true) AS companions,
          COUNT(*) FILTER (WHERE is_scientist = true) AS scientists,
          COUNT(*) FILTER (WHERE is_mobham = true)    AS mobham
        FROM narrators
      `),
    ])
    total = parseInt(countRes.rows[0].count, 10)
    narrators = dataRes.rows
    statsTotal      = parseInt(statsRes.rows[0].total, 10)
    statsCompanions = parseInt(statsRes.rows[0].companions, 10)
    statsScientists = parseInt(statsRes.rows[0].scientists, 10)
    statsMobham     = parseInt(statsRes.rows[0].mobham, 10)
  } catch (err) {
    console.error('Narrators page error:', err)
  }

  const totalPages = Math.ceil(total / limit)

  const buildHref = (overrides: Record<string, string | number | undefined>) => {
    const p: Record<string, string> = {}
    if (q) p.q = q
    if (gradeFilter) p.grade = gradeFilter
    if (companionFilter) p.companion = '1'
    if (tabaqaFilter) p.tabaqa = tabaqaFilter
    if (sortBy !== 'hadiths') p.sort = sortBy
    if (deathMin !== null) p.death_min = String(deathMin)
    if (deathMax !== null) p.death_max = String(deathMax)
    if (quickFilter) p.filter = quickFilter
    Object.entries(overrides).forEach(([k, v]) => {
      if (v !== undefined && v !== '') p[k] = String(v)
      else delete p[k]
    })
    const qs = new URLSearchParams(p).toString()
    return `/narrators${qs ? '?' + qs : ''}`
  }

  const activeFilters = q || gradeFilter || companionFilter || tabaqaFilter || deathMin || deathMax || quickFilter

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-4">
            <Link href="/" className="text-amber-200 hover:text-white text-sm transition-colors">← الرئيسية</Link>
            <h1 className="text-xl font-bold text-amber-100">رواة الحديث</h1>
            <div className="flex gap-2 flex-wrap">
              <Link href="/narrators/chain-filter" className="text-amber-300 hover:text-amber-100 text-xs border border-amber-400/30 px-2 py-1 rounded transition-colors">
                تتبع الإسناد
              </Link>
              <Link href="/narrators/network" className="text-amber-300 hover:text-amber-100 text-xs border border-amber-400/30 px-2 py-1 rounded transition-colors">
                المحورية
              </Link>
              <Link href="/narrators/cities" className="text-amber-300 hover:text-amber-100 text-xs border border-amber-400/30 px-2 py-1 rounded transition-colors">
                البلدان
              </Link>
              <Link href="/narrators/stats" className="text-amber-300 hover:text-amber-100 text-xs border border-amber-400/30 px-2 py-1 rounded transition-colors">
                إحصاءات
              </Link>
            </div>
          </div>

          {/* Search */}
          <form method="GET" action="/narrators" className="space-y-3">
            <div className="relative">
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="ابحث باسم الراوي أو كنيته..."
                className="w-full bg-white/10 border border-white/20 text-white placeholder-white/50 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-amber-300 transition-colors"
              />
              <button type="submit" className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-300 text-sm">بحث</button>
            </div>

            {/* Filter Row */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-white/60 text-xs">تصفية:</span>

              {/* Companion toggle */}
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  name="companion"
                  value="1"
                  defaultChecked={companionFilter}
                  className="w-4 h-4 rounded text-amber-500"
                />
                <span className="text-white/80 text-xs">الصحابة فقط</span>
              </label>

              {/* Grade buttons */}
              {GRADE_FILTERS.map(gf => (
                <Link
                  key={gf.label}
                  href={buildHref({ grade: gradeFilter === gf.label ? '' : gf.label, page: undefined })}
                  className={`text-xs px-3 py-1 rounded-full transition-colors ${
                    gradeFilter === gf.label
                      ? 'bg-amber-400 text-green-900 font-bold'
                      : 'bg-white/10 text-white/70 hover:bg-white/20'
                  }`}
                >
                  {gf.label}
                </Link>
              ))}

              {/* Sort */}
              <div className="flex items-center gap-1 mr-auto">
                <span className="text-white/60 text-xs">ترتيب:</span>
                {[
                  { key: 'hadiths', label: 'الأحاديث' },
                  { key: 'death', label: 'الوفاة' },
                  { key: 'name', label: 'الاسم' },
                ].map(s => (
                  <Link
                    key={s.key}
                    href={buildHref({ sort: s.key, page: undefined })}
                    className={`text-xs px-2 py-1 rounded transition-colors ${
                      sortBy === s.key
                        ? 'bg-white text-green-900 font-bold'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Tabaqa filters */}
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-white/50 text-xs">الطبقة:</span>
              {TABAQA_FILTERS.map(tf => (
                <Link
                  key={tf.label}
                  href={buildHref({ tabaqa: tabaqaFilter === tf.label ? '' : tf.label, page: undefined })}
                  title={tf.desc}
                  className={`text-xs px-2.5 py-0.5 rounded-full transition-colors ${
                    tabaqaFilter === tf.label
                      ? 'bg-amber-300 text-green-900 font-bold'
                      : 'bg-white/5 text-white/50 hover:bg-white/15 hover:text-white/80'
                  }`}
                >
                  {tf.label}
                </Link>
              ))}
              {tabaqaFilter && !TABAQA_FILTERS.some(tf => tf.label === tabaqaFilter) && (
                <span className="text-xs text-amber-300">{tabaqaFilter}</span>
              )}
            </div>

            {/* Death year range */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-white/50 text-xs">سنة الوفاة:</span>
              <input
                type="number"
                name="death_min"
                defaultValue={deathMin ?? ''}
                placeholder="من"
                min={1}
                max={1500}
                className="w-20 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-300"
              />
              <span className="text-white/40 text-xs">–</span>
              <input
                type="number"
                name="death_max"
                defaultValue={deathMax ?? ''}
                placeholder="إلى"
                min={1}
                max={1500}
                className="w-20 bg-white/10 border border-white/20 text-white placeholder-white/40 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-amber-300"
              />
              <span className="text-white/40 text-xs">هـ</span>
              <button type="submit" className="text-xs text-amber-300 hover:text-amber-100 px-2 py-1 rounded border border-amber-400/30 hover:border-amber-300 transition-colors">
                تطبيق
              </button>
              {(deathMin || deathMax) && (
                <a href={buildHref({ death_min: undefined, death_max: undefined, page: undefined })}
                  className="text-xs text-white/40 hover:text-white/70 underline">
                  إزالة
                </a>
              )}
            </div>

            {/* Quick filters row */}
            <div className="flex flex-wrap gap-2 items-center pt-1 border-t border-white/10">
              <span className="text-white/50 text-xs">تصنيف سريع:</span>
              {QUICK_FILTERS.map(qf => {
                const isActive = quickFilter === qf.key
                return (
                  <Link
                    key={qf.key}
                    href={buildHref({ filter: isActive ? '' : qf.key, page: undefined })}
                    className={`text-xs px-3 py-1 rounded-full transition-colors border ${
                      isActive
                        ? 'bg-amber-400 text-green-900 font-bold border-amber-400'
                        : 'bg-white/5 text-white/60 border-white/20 hover:bg-white/15 hover:text-white/90'
                    }`}
                  >
                    {qf.label}
                  </Link>
                )
              })}
            </div>
          </form>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">

        {/* Stats Banner */}
        <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link
            href="/narrators"
            className="bg-white rounded-xl border border-gray-100 hover:border-green-200 px-4 py-3 text-center transition-all hover:shadow-sm"
          >
            <div className="text-2xl font-bold text-green-800">{statsTotal.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-0.5">إجمالي الرواة</div>
          </Link>
          <Link
            href="/narrators?filter=companions"
            className={`rounded-xl border px-4 py-3 text-center transition-all hover:shadow-sm ${
              quickFilter === 'companions'
                ? 'bg-amber-100 border-amber-400'
                : 'bg-white border-gray-100 hover:border-amber-300'
            }`}
          >
            <div className="text-2xl font-bold text-amber-700">{statsCompanions.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-0.5">الصحابة</div>
          </Link>
          <Link
            href="/narrators?filter=scientists"
            className={`rounded-xl border px-4 py-3 text-center transition-all hover:shadow-sm ${
              quickFilter === 'scientists'
                ? 'bg-blue-100 border-blue-400'
                : 'bg-white border-gray-100 hover:border-blue-300'
            }`}
          >
            <div className="text-2xl font-bold text-blue-700">{statsScientists.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-0.5">علماء ناقدون</div>
          </Link>
          <Link
            href="/narrators?filter=mobham"
            className={`rounded-xl border px-4 py-3 text-center transition-all hover:shadow-sm ${
              quickFilter === 'mobham'
                ? 'bg-gray-200 border-gray-400'
                : 'bg-white border-gray-100 hover:border-gray-300'
            }`}
          >
            <div className="text-2xl font-bold text-gray-600">{statsMobham.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-0.5">مبهمون</div>
          </Link>
        </div>

        {/* Results info */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            {q && <span className="text-gray-600 text-sm">البحث: <strong className="text-green-800">{q}</strong></span>}
            {gradeFilter && <span className="text-gray-600 text-sm">الدرجة: <strong className="text-green-800">{gradeFilter}</strong></span>}
            {tabaqaFilter && <span className="text-gray-600 text-sm">الطبقة: <strong className="text-green-800">{tabaqaFilter}</strong></span>}
            {(deathMin || deathMax) && (
              <span className="text-gray-600 text-sm">
                الوفاة: <strong className="text-green-800">{deathMin ?? '...'} – {deathMax ?? '...'} هـ</strong>
              </span>
            )}
            {companionFilter && <span className="text-gray-600 text-sm font-medium text-amber-700">الصحابة</span>}
            {quickFilter && (
              <span className="text-gray-600 text-sm font-medium text-green-700">
                {QUICK_FILTERS.find(f => f.key === quickFilter)?.label}
              </span>
            )}
            {activeFilters && (
              <Link href="/narrators" className="text-xs text-gray-400 hover:text-gray-600 underline">إزالة التصفية</Link>
            )}
          </div>
          <span className="text-sm text-gray-500">{total.toLocaleString('ar-EG')} راوٍ</span>
        </div>

        {/* Narrator Cards */}
        {narrators.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-12 text-center text-gray-400">
            لا توجد نتائج
          </div>
        ) : (
          <div className="space-y-1.5">
            {narrators.map((narrator) => (
              <Link
                key={narrator.id}
                href={`/narrator/${narrator.id}`}
                className="block bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm px-4 py-3 transition-all group"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                    {narrator.is_companion && (
                      <span className="shrink-0 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">صحابي</span>
                    )}
                    {narrator.is_mobham && (
                      <span className="shrink-0 bg-gray-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">مبهم</span>
                    )}
                    <span className="text-green-900 font-medium group-hover:text-green-700 transition-colors">
                      {narrator.name}
                    </span>
                    {narrator.martaba_ibn_hajar && (
                      <span className="text-xs text-gray-500">ابن حجر: {narrator.martaba_ibn_hajar}</span>
                    )}
                    {narrator.martaba_zahabi && (
                      <span className="text-xs text-gray-500">الذهبي: {narrator.martaba_zahabi}</span>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs text-gray-400">
                    {narrator.tabaqa && (
                      <span className="hidden sm:inline truncate max-w-24">{narrator.tabaqa.replace(/\.$/, '').trim()}</span>
                    )}
                    {narrator.death_year_num != null && narrator.death_year_num > 0 && (
                      <span>ت.{narrator.death_year_num}هـ</span>
                    )}
                    {narrator.hadiths_count != null && narrator.hadiths_count > 0 && (
                      <span className="text-green-700 font-semibold">
                        {narrator.hadiths_count.toLocaleString('ar-EG')}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2 flex-wrap">
            {page > 1 && (
              <Link href={buildHref({ page: page - 1 })}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                السابق
              </Link>
            )}
            {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
              let p: number
              if (totalPages <= 7) p = i + 1
              else if (page <= 4) p = i + 1
              else if (page >= totalPages - 3) p = totalPages - 6 + i
              else p = page - 3 + i
              return (
                <Link key={p} href={buildHref({ page: p })}
                  className={`px-4 py-2 rounded-lg border text-sm ${
                    p === page
                      ? 'bg-green-800 text-white border-green-800'
                      : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                  }`}>
                  {p.toLocaleString('ar-EG')}
                </Link>
              )
            })}
            {page < totalPages && (
              <Link href={buildHref({ page: page + 1 })}
                className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                التالي
              </Link>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
