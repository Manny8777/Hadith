import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الرواة في مواضع الإسناد — جامع خادم الحرمين' }

interface PositionNarrator {
  narrator_id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  tabaqa: string | null
  death_year: string | null
  hadith_count: number
}

function gradeClass(g: string | null): string {
  if (!g) return 'bg-gray-100 text-gray-500 border-gray-200'
  if (/ثقة|ثبت|حجة|إمام|صحابي/.test(g)) return 'bg-green-100 text-green-800 border-green-200'
  if (/صدوق|لا بأس|مقبول/.test(g)) return 'bg-amber-100 text-amber-800 border-amber-200'
  if (/ضعيف|منكر|متروك/.test(g)) return 'bg-red-100 text-red-700 border-red-200'
  return 'bg-gray-100 text-gray-600 border-gray-200'
}

const POSITION_LABELS: Record<number, { ar: string; desc: string }> = {
  1: { ar: 'الصحابة (الموقع الأول)', desc: 'من رووا مباشرة عن النبي ﷺ' },
  2: { ar: 'التابعون (الموقع الثاني)', desc: 'من رووا عن الصحابة مباشرة' },
  3: { ar: 'أتباع التابعين (الموقع الثالث)', desc: 'الطبقة الثالثة في سلسلة الرواية' },
  4: { ar: 'الموقع الرابع', desc: 'الطبقة الرابعة — عصر أتباع الأتباع' },
  5: { ar: 'الموقع الخامس', desc: 'الطبقة الخامسة' },
  6: { ar: 'الموقع السادس', desc: 'الطبقة السادسة' },
}

export default async function ChainPositionsPage({
  searchParams,
}: {
  searchParams: Promise<{ pos?: string; book?: string }>
}) {
  const sp = await searchParams
  const pos = Math.max(1, Math.min(8, parseInt(sp.pos || '2')))
  const bookId = sp.book ? parseInt(sp.book) : null

  const bookClause = bookId ? `AND ht.book_id = $2` : ''
  const params: (number)[] = bookId ? [pos, bookId] : [pos]

  const [narratorsRes, totalRes, posStatsRes] = await Promise.all([
    pool.query<PositionNarrator>(
      `SELECT
         pos.nar_id AS narrator_id,
         n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion,
         n.tabaqa, n.death_year_num AS death_year,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN LATERAL (
         SELECT nar_id
         FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS p(nar_id, ord)
         WHERE p.ord = $1
         LIMIT 1
       ) pos ON true
       JOIN narrators n ON n.id = pos.nar_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${bookClause}
       GROUP BY pos.nar_id, n.name, n.abb_name, n.martaba_ibn_hajar, n.is_companion, n.tabaqa, n.death_year
       ORDER BY hadith_count DESC
       LIMIT 50`,
      params
    ).catch(() => ({ rows: [] as PositionNarrator[] })),

    pool.query<{ cnt: number; unique_narrators: number }>(
      `SELECT
         COUNT(DISTINCT ih.hadith_id)::int AS cnt,
         COUNT(DISTINCT pos.nar_id)::int AS unique_narrators
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN LATERAL (
         SELECT nar_id
         FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS p(nar_id, ord)
         WHERE p.ord = $1
         LIMIT 1
       ) pos ON true
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${bookClause}`,
      params
    ).catch(() => ({ rows: [{ cnt: 0, unique_narrators: 0 }] })),

    // Stats across all positions
    pool.query<{ pos: number; unique_narrators: number }>(
      `SELECT
         sub.pos::int,
         COUNT(DISTINCT sub.nar_id)::int AS unique_narrators
       FROM (
         SELECT p.ord AS pos, p.nar_id
         FROM isnad_chains ic
         JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS p(nar_id, ord) ON true
         WHERE p.ord BETWEEN 1 AND 8
       ) sub
       GROUP BY sub.pos
       ORDER BY sub.pos`
    ).catch(() => ({ rows: [] as { pos: number; unique_narrators: number }[] })),
  ])

  const narrators = narratorsRes.rows
  const totalStats = totalRes.rows[0] || { cnt: 0, unique_narrators: 0 }
  const posStats = posStatsRes.rows

  const maxCount = narrators[0]?.hadith_count || 1

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة في مواضع الإسناد</h1>
        <p className="text-sm text-gray-500 mb-3">
          تحليل توزيع الرواة في كل موضع من سلسلة الإسناد — يكشف الرواة المحوريين (نقاط التجميع)
          في كل طبقة من طبقات الرواية
        </p>

        {/* Position summary bar */}
        {posStats.length > 0 && (
          <div className="flex items-end gap-1 bg-white rounded-xl border border-gray-100 p-4 mb-4 overflow-x-auto">
            {posStats.map(s => (
              <Link key={s.pos} href={`/narrators/chain-positions?pos=${s.pos}`}
                className={`flex flex-col items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${
                  pos === s.pos ? 'bg-green-800 text-white' : 'hover:bg-green-50 text-green-900'
                }`}>
                <div className="text-xs font-bold">{s.pos}</div>
                <div className={`w-6 rounded-t ${pos === s.pos ? 'bg-green-400' : 'bg-green-200'}`}
                  style={{ height: `${Math.max(4, Math.min(40, (s.unique_narrators / posStats[0].unique_narrators) * 40))}px` }} />
                <div className="text-xs opacity-70">{s.unique_narrators.toLocaleString('ar-EG')}</div>
              </Link>
            ))}
            <div className="text-xs text-gray-400 mr-2 self-center">راوٍ</div>
          </div>
        )}

        {/* Position tabs */}
        <div className="flex items-center gap-1.5 flex-wrap mb-1">
          {[1, 2, 3, 4, 5, 6].map(p => (
            <Link key={p} href={`/narrators/chain-positions?pos=${p}`}
              className={`text-xs px-3 py-1.5 rounded-xl border font-medium transition-colors ${
                pos === p ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-700 border-gray-200 hover:border-green-300'
              }`}>
              الموقع {p === 1 ? 'الأول' : p === 2 ? 'الثاني' : p === 3 ? 'الثالث' : p === 4 ? 'الرابع' : p === 5 ? 'الخامس' : 'السادس'}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        <span className="font-semibold">{POSITION_LABELS[pos]?.ar}: </span>
        {POSITION_LABELS[pos]?.desc} —
        <span className="font-semibold mr-1">{totalStats.unique_narrators.toLocaleString('ar-EG')}</span> راوٍ مختلف
        في <span className="font-semibold">{totalStats.cnt.toLocaleString('ar-EG')}</span> حديث
        <span className="opacity-70 mr-1">(نتائج أولى 50)</span>
      </div>

      <div className="space-y-2">
        {narrators.map((n, i) => {
          const pct = Math.round((n.hadith_count / maxCount) * 100)
          return (
            <Link key={n.narrator_id} href={`/narrator/${n.narrator_id}`}
              className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group">

              <span className="text-xs text-gray-300 w-5 shrink-0 text-left">{i + 1}</span>

              {/* Rank bar */}
              <div className="w-16 shrink-0">
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    i === 0 ? 'bg-green-600' : i < 5 ? 'bg-green-400' : i < 15 ? 'bg-amber-400' : 'bg-gray-300'
                  }`}
                    style={{ width: `${pct}%` }} />
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm text-green-900 group-hover:underline">
                    {n.abb_name || n.name}
                  </span>
                  {n.is_companion && (
                    <span className="text-xs bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">صحابي</span>
                  )}
                  {n.martaba_ibn_hajar && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full border ${gradeClass(n.martaba_ibn_hajar)}`}>
                      {n.martaba_ibn_hajar.split('،')[0].trim().slice(0, 15)}
                    </span>
                  )}
                </div>
                {(n.tabaqa || n.death_year) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {n.tabaqa && <span className="text-xs text-gray-400">{n.tabaqa}</span>}
                    {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}</span>}
                  </div>
                )}
              </div>

              <div className="shrink-0 text-left">
                <div className="text-sm font-bold text-green-800">
                  {n.hadith_count.toLocaleString('ar-EG')}
                </div>
                <div className="text-xs text-gray-400">حديث</div>
              </div>

              <div className="text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full shrink-0">
                <Link
                  href={`/narrators/chain-filter?seed=${n.narrator_id}`}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  className="hover:underline"
                >
                  تتبع الإسناد
                </Link>
              </div>
            </Link>
          )
        })}
      </div>

      {narrators.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد بيانات لهذا الموقع
        </div>
      )}

      {/* Research note */}
      <div className="mt-6 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
        <p className="font-semibold mb-1">ملاحظة منهجية</p>
        <p>
          يُعرَّف "المدار" في علم الإسناد بالراوي الذي تلتقي عنده أسانيد الحديث من رواة مختلفين —
          فيصير نقطة تجميع مركزية. يُحدِّد هذا الفهرس الرواة الأكثر ظهوراً في كل موقع،
          ما يعين الباحث على رسم "شجرة الإسناد العامة" للحديث وتحديد نقاط الضعف المحتملة.
        </p>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/network" className="text-green-700 hover:underline">← شبكة الأسانيد</Link>
        <Link href="/narrators/chain-filter" className="text-green-700 hover:underline">← تتبع الإسناد</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← الطبقات</Link>
      </div>
    </div>
  )
}
