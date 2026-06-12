import Link from 'next/link'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function NarratorStatsPage() {
  const [gradeRes, tabaqaRes, topRes, centuryRes, bioCntRes] = await Promise.all([
    // Grade distribution from ابن حجر (martaba_ibn_hajar)
    pool.query(`
      SELECT martaba_ibn_hajar as grade, COUNT(*) as cnt
      FROM narrators
      WHERE martaba_ibn_hajar IS NOT NULL AND martaba_ibn_hajar != ''
      GROUP BY martaba_ibn_hajar
      ORDER BY cnt DESC
      LIMIT 30
    `),
    // Tabaqa distribution
    pool.query(`
      SELECT tabaqa, COUNT(*) as cnt
      FROM narrators
      WHERE tabaqa IS NOT NULL AND tabaqa != ''
      GROUP BY tabaqa
      ORDER BY MIN(tabaqa_num) ASC NULLS LAST
      LIMIT 40
    `),
    // Top narrators by hadith count
    pool.query(`
      SELECT id, name, abb_name, hadiths_count, martaba_ibn_hajar, is_companion
      FROM narrators
      WHERE hadiths_count > 0
      ORDER BY hadiths_count DESC
      LIMIT 20
    `),
    // Narrators by death century
    pool.query(`
      SELECT
        CASE
          WHEN death_year_num BETWEEN 1 AND 100 THEN 'القرن الأول'
          WHEN death_year_num BETWEEN 101 AND 200 THEN 'القرن الثاني'
          WHEN death_year_num BETWEEN 201 AND 300 THEN 'القرن الثالث'
          WHEN death_year_num BETWEEN 301 AND 400 THEN 'القرن الرابع'
          WHEN death_year_num BETWEEN 401 AND 500 THEN 'القرن الخامس'
          WHEN death_year_num > 500 THEN 'ما بعد القرن الخامس'
          ELSE 'غير معروف'
        END as century,
        COUNT(*) as cnt
      FROM narrators
      GROUP BY century
      ORDER BY MIN(death_year_num) ASC NULLS LAST
    `),
    // Narrators with biography count
    pool.query(`SELECT COUNT(DISTINCT narrator_id) as cnt FROM narrator_biography`),
  ])

  const grades = gradeRes.rows as { grade: string; cnt: string }[]
  const tabaqas = tabaqaRes.rows as { tabaqa: string; cnt: string }[]
  const topNarrators = topRes.rows as { id: number; name: string; abb_name: string; hadiths_count: number; martaba_ibn_hajar: string; is_companion: boolean }[]
  const centuries = centuryRes.rows as { century: string; cnt: string }[]
  const bioCount = parseInt(bioCntRes.rows[0]?.cnt || '0')

  const totalNarrators = grades.reduce((sum, g) => sum + parseInt(g.cnt), 0)

  // Classify grades into broad categories
  const gradeGroups = {
    'ثقة وما في معناها': grades.filter(g => /ثقة|ثبت|حجة|صحيح|عدل|صدوق|لا بأس|مقبول/.test(g.grade)),
    'ضعيف وما في معناها': grades.filter(g => /ضعيف|منكر|متروك|واهٍ|كذاب|وضاع|مردود/.test(g.grade)),
    'مجهول وما في معناها': grades.filter(g => /مجهول/.test(g.grade)),
  }
  const companionCount = tabaqas.find(t => /صحابي|الصحابة/.test(t.tabaqa))?.cnt || '0'

  function gradingBadge(grade: string | null) {
    if (!grade) return null
    let cls = 'bg-gray-100 text-gray-600'
    if (/ثقة|صحيح|عدل|صحابي/.test(grade)) cls = 'bg-green-100 text-green-700'
    else if (/صدوق|حسن|مقبول/.test(grade)) cls = 'bg-amber-100 text-amber-700'
    else if (/ضعيف|منكر|متروك|كذاب/.test(grade)) cls = 'bg-red-100 text-red-600'
    return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{grade}</span>
  }

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm">← الرواة</Link>
          <h1 className="text-lg font-bold text-amber-100">إحصاءات الرواة</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { num: (30087).toLocaleString('ar-EG'), label: 'إجمالي الرواة', sub: 'في قاعدة البيانات', color: 'border-green-200 bg-green-50' },
            { num: bioCount.toLocaleString('ar-EG'), label: 'مترجَم له', sub: 'من كتب التراجم', color: 'border-amber-200 bg-amber-50' },
            { num: companionCount, label: 'من الصحابة', sub: 'في الطبقة الأولى', color: 'border-yellow-200 bg-yellow-50' },
            { num: grades.length.toString(), label: 'درجة مختلفة', sub: 'في الجرح والتعديل', color: 'border-red-200 bg-red-50' },
          ].map((s, i) => (
            <div key={i} className={`rounded-2xl border p-5 ${s.color}`}>
              <div className="text-2xl font-bold text-green-900">{s.num}</div>
              <div className="text-sm font-medium text-gray-700 mt-1">{s.label}</div>
              <div className="text-xs text-gray-500">{s.sub}</div>
            </div>
          ))}
        </div>

        {/* Two column: grades + centuries */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Grade distribution */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-green-900 mb-4">توزيع الدرجات (ابن حجر)</h2>
            <div className="space-y-2">
              {grades.slice(0, 20).map((g, i) => {
                const pct = Math.round((parseInt(g.cnt) / Math.max(...grades.map(x => parseInt(x.cnt)))) * 100)
                let barColor = 'bg-gray-300'
                if (/ثقة|ثبت|حجة|عدل/.test(g.grade)) barColor = 'bg-green-500'
                else if (/صدوق|مقبول|لا بأس/.test(g.grade)) barColor = 'bg-amber-400'
                else if (/ضعيف|منكر|متروك|كذاب/.test(g.grade)) barColor = 'bg-red-500'
                else if (/مجهول/.test(g.grade)) barColor = 'bg-gray-400'
                return (
                  <div key={i} className="flex items-center gap-3">
                    <Link href={`/narrators?grade=${encodeURIComponent(g.grade)}`}
                      className="text-sm text-green-800 hover:underline min-w-32 truncate">
                      {g.grade}
                    </Link>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className={`${barColor} h-2 rounded-full`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 min-w-10 text-left">{parseInt(g.cnt).toLocaleString('ar-EG')}</span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Century distribution */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-base font-bold text-green-900 mb-4">توزيع الرواة حسب القرن</h2>
            <div className="space-y-3">
              {centuries.map((c, i) => {
                const max = Math.max(...centuries.map(x => parseInt(x.cnt)))
                const pct = Math.round((parseInt(c.cnt) / max) * 100)
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700">{c.century}</span>
                      <span className="text-green-800 font-medium">{parseInt(c.cnt).toLocaleString('ar-EG')}</span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-600 mb-3">عدد الرواة بكل طبقة</h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto text-xs">
                {tabaqas.map((t, i) => (
                  <div key={i} className="flex justify-between">
                    <Link href={`/narrators?q=${encodeURIComponent(t.tabaqa)}`}
                      className="text-green-700 hover:underline truncate max-w-48">{t.tabaqa}</Link>
                    <span className="text-gray-500 shrink-0 mr-2">{parseInt(t.cnt).toLocaleString('ar-EG')}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Top narrators */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-4">أكثر الرواة أحاديث في الكتب الستة وما يليها</h2>
          <div className="space-y-2">
            {topNarrators.map((n, i) => (
              <Link key={n.id} href={`/narrator/${n.id}`}
                className="flex items-center gap-3 hover:bg-gray-50 rounded-xl p-2.5 transition-colors group">
                <span className="text-gray-400 text-sm min-w-6 text-center">{i + 1}</span>
                {n.is_companion && (
                  <span className="shrink-0 bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">ص</span>
                )}
                <span className="flex-1 font-medium text-green-900 group-hover:text-green-700">
                  {n.abb_name || n.name}
                </span>
                {gradingBadge(n.martaba_ibn_hajar)}
                <span className="text-green-700 font-bold text-sm shrink-0">
                  {n.hadiths_count.toLocaleString('ar-EG')}
                </span>
              </Link>
            ))}
          </div>
        </div>

      </main>
    </div>
  )
}
