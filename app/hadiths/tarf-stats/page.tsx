export const dynamic = 'force-dynamic'
export const metadata = { title: 'إحصائيات الأطراف — جامع خادم الحرمين' }

import pool from '@/lib/db'
import Link from 'next/link'

/* ─── Types ─────────────────────────────────────────────────── */

interface BookTarfCount {
  title: string
  tarf_count: string
}

interface SharedTarf {
  clean_tarf: string
  book_count: string
}

interface LengthDist {
  len_cat: string
  count: string
}

/* ─── Helpers ────────────────────────────────────────────────── */

function Bar({
  value,
  max,
  color = 'bg-green-600',
}: {
  value: number
  max: number
  color?: string
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
      <div className={`${color} h-2.5 rounded-full`} style={{ width: `${pct}%` }} />
    </div>
  )
}

function StatCard({
  num,
  label,
  sub,
  accent,
}: {
  num: string
  label: string
  sub: string
  accent: string
}) {
  return (
    <div className={`rounded-2xl border p-5 ${accent}`}>
      <div className="text-2xl font-bold text-green-900">{num}</div>
      <div className="text-sm font-medium text-gray-700 mt-1">{label}</div>
      <div className="text-xs text-gray-500">{sub}</div>
    </div>
  )
}

/* ─── Page ───────────────────────────────────────────────────── */

export default async function TarfStatsPage() {
  const [totalRes, byBookRes, sharedRes, lengthRes] = await Promise.all([
    /* 1. Total distinct tarfs */
    pool.query<{ total_hadiths: string; distinct_tarfs: string }>(`
      SELECT
        COUNT(*)                   AS total_hadiths,
        COUNT(DISTINCT tarf)       AS distinct_tarfs
      FROM hadith_toc
      WHERE is_leaf = true AND is_paragraph = true
    `),

    /* 2. Tarfs per book — top 20 */
    pool.query<BookTarfCount>(`
      SELECT b.title, COUNT(*) AS tarf_count
      FROM hadith_toc h
      JOIN books b ON b.id = h.book_id
      WHERE h.is_leaf = true AND h.is_paragraph = true
      GROUP BY b.title
      ORDER BY tarf_count DESC
      LIMIT 20
    `),

    /* 3. Tarfs shared across multiple books — top 20 */
    pool.query<SharedTarf>(`
      SELECT
        regexp_replace(tarf, '<[^>]+>', ' ', 'g') AS clean_tarf,
        COUNT(DISTINCT book_id) AS book_count
      FROM hadith_toc
      WHERE is_leaf = true AND is_paragraph = true AND tarf IS NOT NULL
      GROUP BY clean_tarf
      HAVING COUNT(DISTINCT book_id) > 1
      ORDER BY book_count DESC
      LIMIT 20
    `),

    /* 4. Tarf length distribution */
    pool.query<LengthDist>(`
      SELECT
        CASE
          WHEN length(tarf) < 50  THEN 'قصير (أقل من 50 حرفًا)'
          WHEN length(tarf) < 150 THEN 'متوسط (50–149 حرفًا)'
          ELSE                         'طويل (150 حرفًا فأكثر)'
        END AS len_cat,
        COUNT(*) AS count
      FROM hadith_toc
      WHERE is_leaf = true AND is_paragraph = true AND tarf IS NOT NULL
      GROUP BY 1
    `),
  ])

  const totalHadiths  = parseInt(totalRes.rows[0]?.total_hadiths  || '0')
  const distinctTarfs = parseInt(totalRes.rows[0]?.distinct_tarfs || '0')
  const sharedCount   = sharedRes.rows.length

  const byBook    = byBookRes.rows  as BookTarfCount[]
  const sharedRows = sharedRes.rows as SharedTarf[]
  const lengthRows = lengthRes.rows as LengthDist[]

  // Sort length categories into a fixed display order
  const lenOrder = ['قصير (أقل من 50 حرفًا)', 'متوسط (50–149 حرفًا)', 'طويل (150 حرفًا فأكثر)']
  const sortedLength = lenOrder
    .map(cat => lengthRows.find(r => r.len_cat === cat) ?? { len_cat: cat, count: '0' })

  const maxBookCount = byBook.length > 0 ? parseInt(byBook[0].tarf_count) : 1
  const maxLenCount  = Math.max(...sortedLength.map(r => parseInt(r.count)), 1)

  const lenColors = ['bg-green-500', 'bg-amber-500', 'bg-blue-500']
  const lenLabels = [
    { cat: 'قصير (أقل من 50 حرفًا)',    color: 'bg-green-500',  text: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
    { cat: 'متوسط (50–149 حرفًا)',       color: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200' },
    { cat: 'طويل (150 حرفًا فأكثر)',     color: 'bg-blue-500',   text: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200'  },
  ]

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">

      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/hadiths/tarf-index" className="text-amber-200 hover:text-white text-sm">
            ← فهرس الأطراف
          </Link>
          <h1 className="text-lg font-bold text-amber-100">إحصائيات الأطراف</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">
            الرئيسية
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-8">

        {/* Nav shortcut */}
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/hadiths/tarf-index"
            className="inline-flex items-center gap-2 bg-green-800 text-white px-4 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium"
          >
            <span>تصفح فهرس الأطراف الأبجدي</span>
            <span className="text-amber-300">←</span>
          </Link>
          <span className="text-gray-400 text-xs">للوصول إلى الأحاديث بحسب مستهلها</span>
        </div>

        {/* ── 1. Summary cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            num={totalHadiths.toLocaleString('ar-EG')}
            label="إجمالي الأحاديث"
            sub="أوراق is_leaf + is_paragraph"
            accent="border-green-200 bg-green-50"
          />
          <StatCard
            num={distinctTarfs.toLocaleString('ar-EG')}
            label="أطراف متمايزة"
            sub="COUNT DISTINCT بحسب النص"
            accent="border-amber-200 bg-amber-50"
          />
          <StatCard
            num={sharedCount.toLocaleString('ar-EG')}
            label="أطراف مشتركة"
            sub="تظهر في أكثر من كتاب"
            accent="border-blue-200 bg-blue-50"
          />
        </div>

        {/* ── 2. Bar chart: hadiths per book (top 20) ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-5">
            عدد الأطراف حسب الكتاب
            <span className="text-sm font-normal text-gray-400 mr-2">(أعلى 20 كتابًا)</span>
          </h2>

          <div className="space-y-3">
            {byBook.map((b, i) => {
              const cnt = parseInt(b.tarf_count)
              const pct = maxBookCount > 0 ? Math.round((cnt / maxBookCount) * 100) : 0
              return (
                <div key={i} className="flex items-center gap-3 group">
                  {/* rank */}
                  <span className="text-xs text-gray-300 w-6 shrink-0 text-left font-mono">
                    {(i + 1).toLocaleString('ar-EG')}
                  </span>
                  {/* book name */}
                  <span className="text-sm text-green-800 min-w-0 shrink-0 w-52 truncate" title={b.title}>
                    {b.title}
                  </span>
                  {/* bar */}
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-green-600 h-3 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {/* count */}
                  <span className="text-xs text-gray-600 font-medium tabular-nums shrink-0 w-16 text-left">
                    {cnt.toLocaleString('ar-EG')}
                  </span>
                </div>
              )
            })}
          </div>

          {byBook.length === 0 && (
            <p className="text-gray-400 text-sm text-center py-8">لا توجد بيانات</p>
          )}
        </section>

        {/* ── 3. Shared tarfs table ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-1">
            الأطراف المشتركة بين أكثر من كتاب
          </h2>
          <p className="text-xs text-gray-400 mb-5">
            نص الطرف يظهر في كتابَين أو أكثر — يكشف عن الأحاديث الأكثر انتشارًا في الكتب
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-right pb-3 pr-2 font-semibold text-gray-500 w-8">#</th>
                  <th className="text-right pb-3 font-semibold text-gray-600">طرف الحديث</th>
                  <th className="text-center pb-3 font-semibold text-green-700 w-28 shrink-0">عدد الكتب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sharedRows.map((row, i) => {
                  const cnt = parseInt(row.book_count)
                  // strip residual whitespace artifacts
                  const text = (row.clean_tarf || '').replace(/\s+/g, ' ').trim()
                  return (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="py-3 pr-2 text-gray-300 text-xs font-mono">
                        {(i + 1).toLocaleString('ar-EG')}
                      </td>
                      <td className="py-3 leading-relaxed text-gray-700 max-w-md">
                        <span className="line-clamp-2">{text || '—'}</span>
                      </td>
                      <td className="py-3 text-center">
                        <span
                          className={`inline-flex items-center justify-center rounded-full px-3 py-0.5 text-xs font-bold
                            ${cnt >= 5 ? 'bg-green-100 text-green-800' :
                              cnt >= 3 ? 'bg-amber-100 text-amber-700' :
                                         'bg-gray-100 text-gray-600'}`}
                        >
                          {cnt.toLocaleString('ar-EG')} {cnt === 1 ? 'كتاب' : 'كتب'}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {sharedRows.length === 0 && (
              <p className="text-gray-400 text-sm text-center py-8">لا توجد أطراف مشتركة</p>
            )}
          </div>
        </section>

        {/* ── 4. Length distribution ── */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-base font-bold text-green-900 mb-5">
            توزيع أطوال الأطراف
          </h2>

          {/* Cards row */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {sortedLength.map((r, i) => {
              const meta = lenLabels[i]
              const cnt = parseInt(r.count)
              const total = sortedLength.reduce((s, x) => s + parseInt(x.count), 0)
              const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-4 ${meta.bg} ${meta.border}`}
                >
                  <div className={`text-2xl font-bold ${meta.text}`}>
                    {cnt.toLocaleString('ar-EG')}
                  </div>
                  <div className="text-xs font-medium text-gray-600 mt-1 leading-snug">
                    {r.len_cat}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{pct}% من الإجمالي</div>
                </div>
              )
            })}
          </div>

          {/* Horizontal bar chart */}
          <div className="space-y-4">
            {sortedLength.map((r, i) => {
              const cnt = parseInt(r.count)
              const pct = maxLenCount > 0 ? Math.round((cnt / maxLenCount) * 100) : 0
              const color = lenColors[i]
              return (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 w-44 shrink-0 truncate" title={r.len_cat}>
                    {r.len_cat}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                    <div
                      className={`${color} h-4 rounded-full transition-all`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs tabular-nums text-gray-500 w-16 text-left shrink-0">
                    {cnt.toLocaleString('ar-EG')}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center gap-4 mt-5 text-xs text-gray-500 border-t border-gray-100 pt-4">
            {lenLabels.map((l, i) => (
              <span key={i} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full inline-block ${l.color}`} />
                {l.cat}
              </span>
            ))}
          </div>
        </section>

        {/* ── Methodology note ── */}
        <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-xs text-green-800 space-y-1.5">
          <p className="font-semibold text-sm">ملاحظات منهجية</p>
          <ul className="list-disc list-inside space-y-1 text-green-700">
            <li>
              يُقصد بـ«الطرف» مستهل الحديث كما نُقل في قاعدة البيانات (عمود <span className="font-mono bg-green-100 px-1 rounded">tarf</span>
              )، ولا يُمثّل بالضرورة أوّل كلمة من المتن.
            </li>
            <li>
              تستند الإحصاءات إلى السجلات التي يكون فيها <span className="font-mono bg-green-100 px-1 rounded">is_leaf = true</span> و
              <span className="font-mono bg-green-100 px-1 rounded"> is_paragraph = true</span> لضمان حصر أحاديث المتن دون الفصول والأبواب.
            </li>
            <li>
              تُحتسب الأطراف «المشتركة» بعد تجريد وسوم HTML بدالة{' '}
              <span className="font-mono bg-green-100 px-1 rounded">regexp_replace</span>.
            </li>
            <li>
              يُحسب الطول بعدد الأحرف في قيمة <span className="font-mono bg-green-100 px-1 rounded">tarf</span> الخام (شاملة وسوم HTML إن وُجدت).
            </li>
          </ul>
        </div>

      </main>
    </div>
  )
}
