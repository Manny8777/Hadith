import Link from 'next/link'
import pool from '@/lib/db'
import NarratorNetworkGraph from '@/app/components/NarratorNetworkGraph'

export const dynamic = 'force-dynamic'

interface SearchParams {
  tabaqa?: string
  grade?: string
  companion?: string
}

interface CentralNarrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  hadiths_count: number | null
  death_year_num: number | null
  tabaqa: string | null
  chain_count: string
}

export default async function NetworkPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const tabaqaFilter = sp.tabaqa ?? ''
  const gradeFilter = sp.grade ?? ''
  const companionOnly = sp.companion === '1'

  // Build dynamic WHERE conditions for post-join filtering
  const extraConditions: string[] = []
  const params: (string | number | boolean)[] = []
  let pi = 1

  if (gradeFilter) {
    extraConditions.push(`n.martaba_ibn_hajar ILIKE $${pi}`)
    params.push(`%${gradeFilter}%`)
    pi++
  }
  if (tabaqaFilter) {
    extraConditions.push(`n.tabaqa ILIKE $${pi}`)
    params.push(`%${tabaqaFilter}%`)
    pi++
  }
  if (companionOnly) {
    extraConditions.push(`n.is_companion = true`)
  }

  const extraWhere = extraConditions.length > 0 ? `AND ${extraConditions.join(' AND ')}` : ''

  // Centrality query: top narrators by chain count, then filter
  // We take top 1000 from the unnest, then filter by narrator attributes
  const centralityQuery = `
    SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion,
           n.hadiths_count, n.death_year_num, n.tabaqa, t.chain_count
    FROM (
      SELECT nid, COUNT(*) as chain_count
      FROM isnad_chains, unnest(narrator_id_array) as nid
      GROUP BY nid
      ORDER BY chain_count DESC
      LIMIT 1000
    ) t
    JOIN narrators n ON n.id = t.nid
    WHERE 1=1 ${extraWhere}
    ORDER BY t.chain_count DESC
    LIMIT 50
  `

  // Simple tabaqa distribution (fast — no chain join needed)
  const tabaqaQuery = `
    SELECT tabaqa, COUNT(*) as cnt
    FROM narrators
    WHERE tabaqa IS NOT NULL AND tabaqa != ''
    GROUP BY tabaqa
    ORDER BY MIN(tabaqa_num) ASC NULLS LAST, cnt DESC
    LIMIT 25
  `

  const [centralityRes, tabaqaRes] = await Promise.all([
    pool.query<CentralNarrator>(centralityQuery, params),
    pool.query<{ tabaqa: string; cnt: string }>(tabaqaQuery),
  ])

  const narrators = centralityRes.rows
  const tabaqaStats = tabaqaRes.rows
  const maxChains = narrators.length > 0 ? Number(narrators[0].chain_count) : 1

  function gradingBadge(grade: string | null) {
    if (!grade) return null
    let cls = 'bg-gray-100 text-gray-500'
    if (/ثقة|ثبت|حجة|عدل|صحابي/.test(grade)) cls = 'bg-green-100 text-green-700'
    else if (/صدوق|مقبول|لا بأس/.test(grade)) cls = 'bg-amber-100 text-amber-700'
    else if (/ضعيف|منكر|متروك|كذاب/.test(grade)) cls = 'bg-red-100 text-red-600'
    return <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${cls}`}>{grade}</span>
  }

  const buildHref = (overrides: Record<string, string | undefined>) => {
    const p: Record<string, string> = {}
    if (tabaqaFilter) p.tabaqa = tabaqaFilter
    if (gradeFilter) p.grade = gradeFilter
    if (companionOnly) p.companion = '1'
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p[k] = v
      else delete p[k]
    })
    const qs = new URLSearchParams(p).toString()
    return `/narrators/network${qs ? '?' + qs : ''}`
  }

  const hasFilter = tabaqaFilter || gradeFilter || companionOnly

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-5">
          <div className="flex items-center justify-between mb-3">
            <Link href="/narrators" className="text-amber-200 hover:text-white text-sm transition-colors">← الرواة</Link>
            <h1 className="text-xl font-bold text-amber-100">محورية الرواة في الأسانيد</h1>
            <Link href="/narrators/stats" className="text-amber-200 hover:text-white text-sm transition-colors">إحصاءات</Link>
          </div>
          <p className="text-white/60 text-sm text-center max-w-2xl mx-auto">
            يُظهر هذا التحليل أكثر الرواة ظهوراً في شبكة الأسانيد، مما يكشف عن أهمية كل راوٍ في نقل الحديث النبوي
          </p>

          {/* Filters */}
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <span className="text-white/50 text-xs self-center">تصفية:</span>

            {/* Companion toggle */}
            <Link
              href={buildHref({ companion: companionOnly ? undefined : '1' })}
              className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                companionOnly ? 'bg-amber-400 text-green-900 font-bold' : 'bg-white/10 text-white/70 hover:bg-white/20'
              }`}
            >
              الصحابة فقط
            </Link>

            <span className="text-white/20 self-center">|</span>

            {/* Grade filter */}
            {[{ label: 'ثقة' }, { label: 'صدوق' }, { label: 'ضعيف' }, { label: 'مجهول' }].map(g => (
              <Link
                key={g.label}
                href={buildHref({ grade: gradeFilter === g.label ? undefined : g.label })}
                className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
                  gradeFilter === g.label
                    ? 'bg-amber-400 text-green-900 font-bold'
                    : 'bg-white/10 text-white/70 hover:bg-white/20'
                }`}
              >
                {g.label}
              </Link>
            ))}

            {hasFilter && (
              <Link href="/narrators/network" className="text-xs text-amber-300 hover:text-white underline self-center mr-2">
                إزالة التصفية
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="grid md:grid-cols-[1fr_220px] gap-6">

          {/* Main: centrality list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-green-900">
                أكثر الرواة ظهوراً في الأسانيد
                {hasFilter && <span className="text-sm font-normal text-gray-500 mr-2">(مُصفَّى)</span>}
              </h2>
              {narrators.length > 0 && (
                <span className="text-xs text-gray-500">أعلى {narrators.length} راوٍ</span>
              )}
            </div>

            {narrators.length === 0 ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center text-gray-400">
                لا توجد نتائج بهذه التصفية
              </div>
            ) : (
              <div className="space-y-2">
                {narrators.map((n, i) => {
                  const pct = Math.round((Number(n.chain_count) / maxChains) * 100)
                  return (
                    <Link
                      key={n.id}
                      href={`/narrator/${n.id}`}
                      className="block bg-white rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm px-4 py-3 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        {/* Rank */}
                        <span className={`text-sm font-bold min-w-7 text-center shrink-0 ${
                          i === 0 ? 'text-yellow-600' :
                          i === 1 ? 'text-gray-500' :
                          i === 2 ? 'text-amber-700' :
                          'text-gray-300'
                        }`}>
                          {i + 1}
                        </span>

                        {/* Name + grade */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {n.is_companion && (
                              <span className="shrink-0 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">ص</span>
                            )}
                            <span className="text-green-900 font-medium group-hover:text-green-700 transition-colors">
                              {n.abb_name || n.name}
                            </span>
                            {gradingBadge(n.martaba_ibn_hajar)}
                          </div>
                          <div className="flex items-center gap-3 mt-1.5">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-48">
                              <div className="bg-green-600 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-gray-400 shrink-0">
                              {n.tabaqa ? n.tabaqa.replace(/\.$/, '').trim() : ''}
                              {n.death_year_num && n.death_year_num > 0 ? ` · ت.${n.death_year_num}هـ` : ''}
                            </span>
                          </div>
                        </div>

                        {/* Chain count */}
                        <div className="shrink-0 text-left min-w-16">
                          <div className="text-green-800 font-bold text-sm text-right">
                            {Number(n.chain_count).toLocaleString('ar-EG')}
                          </div>
                          <div className="text-xs text-gray-400 text-right">إسناداً</div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">

            {/* Tabaqa filter sidebar */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <h3 className="text-sm font-bold text-green-900 mb-3">تصفية بالطبقة</h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {tabaqaStats.map((t, i) => (
                  <Link
                    key={i}
                    href={buildHref({ tabaqa: tabaqaFilter === t.tabaqa ? undefined : t.tabaqa })}
                    className={`flex justify-between items-center px-2 py-1.5 rounded-lg text-xs transition-colors ${
                      tabaqaFilter === t.tabaqa
                        ? 'bg-green-100 text-green-800 font-bold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <span className="truncate max-w-32">{t.tabaqa}</span>
                    <span className="text-gray-400 shrink-0 mr-1">{parseInt(t.cnt).toLocaleString('ar-EG')}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Info box */}
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
              <h3 className="text-xs font-bold text-green-800 mb-2">كيف يُحسَب المقياس؟</h3>
              <p className="text-xs text-green-700 leading-relaxed">
                يُحسب عدد الأسانيد التي يظهر فيها الراوي بغض النظر عن موقعه.
                كلما ارتفع العدد، كان الراوي أكثر مركزيةً في شبكة نقل الحديث.
              </p>
              <div className="mt-3 pt-3 border-t border-green-200 text-xs text-green-600 space-y-1">
                <div>• كبار المحدِّثين (كالطبراني والبيهقي) يظهرون في عشرات الآلاف من الأسانيد</div>
                <div>• الصحابة يظهرون في طرف الإسناد القريب من النبي ﷺ</div>
                <div>• القائمة مأخوذة من أعلى ١٠٠٠ راوٍ في الشبكة</div>
              </div>
            </div>

            {/* Quick links */}
            <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-2">
              <h3 className="text-xs font-bold text-green-900 mb-3">تحليلات ذات صلة</h3>
              {[
                { href: '/chains', label: 'استعراض الأسانيد' },
                { href: '/narrator-types', label: 'علل الإسناد' },
                { href: '/narrators/stats', label: 'إحصاءات الرواة' },
                { href: '/narrators/cities', label: 'الرواة بحسب البلد' },
                { href: '/compare', label: 'مقارنة الرواة' },
              ].map(l => (
                <Link key={l.href} href={l.href}
                  className="block text-xs text-green-700 hover:text-green-900 hover:underline">
                  {l.label} ←
                </Link>
              ))}
            </div>
          </div>
        </div>

        {/* Interactive network graph */}
        <div className="mt-8">
          <h2 className="text-base font-bold text-green-900 mb-1">خريطة شبكة الإسناد</h2>
          <p className="text-xs text-gray-500 mb-3">
            علاقات الرواية المباشرة بين أكثر الرواة ظهوراً — الحجم يعكس عدد الأسانيد، والأسهم تتبع اتجاه الرواية
          </p>
          <NarratorNetworkGraph limit={20} />
        </div>
      </main>
    </div>
  )
}
