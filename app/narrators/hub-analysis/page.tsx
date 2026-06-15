import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مراكز شبكة الرواية — جامع خادم الحرمين' }

interface HubRow {
  narrator_id: number
  narrator_name: string
  abb_name: string | null
  death_year: number | null
  city: string | null
  grade: string | null
  is_companion: boolean
  chain_count: number
  hadith_count: number
  book_count: number
  companion_count: number
  student_count: number
  teacher_count: number
  hub_score: number
}

export default async function HubAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; min_books?: string; min_hadiths?: string }>
}) {
  const sp = await searchParams
  const tab = sp.tab || 'hub'
  const minBooks = Math.max(1, parseInt(sp.min_books || '2'))
  const minHadiths = Math.max(1, parseInt(sp.min_hadiths || '50'))

  const [hubsRes, bridgesRes] = await Promise.all([
    // Hub narrators: appear in most chains, connecting most books and companions
    pool.query<HubRow>(
      `WITH narrator_stats AS (
         SELECT
           n.id AS narrator_id,
           n.name AS narrator_name,
           n.abb_name,
           n.death_year_num AS death_year,
           n.city,
           n.grade,
           n.is_companion,
           COUNT(DISTINCT ic.id)::int AS chain_count,
           COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
           COUNT(DISTINCT ht.book_id)::int AS book_count,
           COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (
             WHERE EXISTS (SELECT 1 FROM narrators nc WHERE nc.id = ic.narrator_id_array[1] AND nc.is_companion = true)
           )::int AS companion_count,
           COUNT(DISTINCT CASE WHEN pos.ord < array_length(ic.narrator_id_array, 1)
                               THEN ic.narrator_id_array[pos.ord + 1] END)::int AS student_count,
           COUNT(DISTINCT CASE WHEN pos.ord > 1
                               THEN ic.narrator_id_array[pos.ord - 1] END)::int AS teacher_count
         FROM narrators n
         JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.id = ih.hadith_id
         CROSS JOIN LATERAL (
           SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
           WHERE t.nid = n.id LIMIT 1
         ) pos
         WHERE NOT n.is_companion
         GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.city, n.grade, n.is_companion
         HAVING COUNT(DISTINCT ih.hadith_id) >= $1
           AND COUNT(DISTINCT ht.book_id) >= $2
       )
       SELECT *,
              (hadith_count * 3 + chain_count * 2 + book_count * 10
               + companion_count * 5 + student_count * 2 + teacher_count * 2)::int AS hub_score
       FROM narrator_stats
       ORDER BY hub_score DESC
       LIMIT 50`,
      [minHadiths, minBooks]
    ).catch(() => ({ rows: [] as HubRow[] })),

    // Bridge narrators: those who uniquely connect specific companions to specific books
    pool.query<{
      narrator_id: number; narrator_name: string; abb_name: string | null;
      death_year: number | null; grade: string | null;
      unique_companion_book_bridges: number; chain_count: number
    }>(
      `WITH narrator_bridges AS (
         SELECT
           n.id AS narrator_id,
           n.name AS narrator_name,
           n.abb_name,
           n.death_year_num AS death_year,
           n.grade,
           COUNT(DISTINCT ic.narrator_id_array[1]::text || '|' || ht.book_id::text)::int AS unique_companion_book_bridges,
           COUNT(DISTINCT ic.id)::int AS chain_count
         FROM narrators n
         JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.id = ih.hadith_id
         WHERE NOT n.is_companion
           AND EXISTS (
             SELECT 1 FROM narrators nc WHERE nc.id = ic.narrator_id_array[1] AND nc.is_companion = true
           )
         GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.grade
         HAVING COUNT(DISTINCT ic.narrator_id_array[1]::text || '|' || ht.book_id::text) >= 3
       )
       SELECT * FROM narrator_bridges
       ORDER BY unique_companion_book_bridges DESC
       LIMIT 50`,
      []
    ).catch(() => ({ rows: [] })),
  ])

  const hubs = hubsRes.rows
  const bridges = bridgesRes.rows

  const maxScore = Math.max(...hubs.map(h => h.hub_score), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة|ثبت|حافظ/.test(g)) return 'text-green-700'
    if (/صدوق|لا بأس/.test(g)) return 'text-blue-600'
    if (/ضعيف|متروك/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مراكز شبكة الرواية</h1>
        <p className="text-sm text-gray-500">
          الرواة الذين يمثلون عقداً مركزية في شبكة الأسانيد — من يمر عبرهم أكثر الأحاديث والكتب والصحابة
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-5">
        <a href={`/narrators/hub-analysis?tab=hub&min_books=${minBooks}&min_hadiths=${minHadiths}`}
          className={`text-sm px-4 py-2 rounded-xl border transition-colors ${
            tab === 'hub' ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200'
          }`}>
          رواة المركز (Hub)
        </a>
        <a href={`/narrators/hub-analysis?tab=bridge&min_books=${minBooks}&min_hadiths=${minHadiths}`}
          className={`text-sm px-4 py-2 rounded-xl border transition-colors ${
            tab === 'bridge' ? 'bg-blue-800 text-white border-blue-800' : 'bg-white text-gray-600 border-gray-200'
          }`}>
          رواة الجسر (Bridge)
        </a>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5 text-sm items-center">
        <span className="text-gray-500 text-xs">حد أدنى للأحاديث:</span>
        {[10, 50, 100, 200].map(n => (
          <a key={n}
            href={`/narrators/hub-analysis?tab=${tab}&min_books=${minBooks}&min_hadiths=${n}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minHadiths === n ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
            {n}+
          </a>
        ))}
        <span className="text-gray-300">|</span>
        <span className="text-gray-500 text-xs">حد أدنى للكتب:</span>
        {[2, 3, 5, 8].map(n => (
          <a key={n}
            href={`/narrators/hub-analysis?tab=${tab}&min_books=${n}&min_hadiths=${minHadiths}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minBooks === n ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-500 border-gray-200 hover:border-green-300'}`}>
            {n}+ كتب
          </a>
        ))}
      </div>

      {/* Hub section */}
      {tab === 'hub' && (
        <div>
          <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-800">
            <strong>رواة المركز</strong>: الرواة الذين تقاطعت في مسيرتهم أكبر عدد من الأحاديث والأسانيد والكتب والصحابة.
            درجة المركزية = (الأحاديث×3) + (الأسانيد×2) + (الكتب×10) + (الصحابة الرواة عنهم×5) + (التلاميذ×2) + (الشيوخ×2)
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {hubs.map((n, i) => (
                <div key={n.narrator_id} className="px-4 py-3 hover:bg-green-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-6 shrink-0">
                      {(i + 1).toLocaleString('ar-EG')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link href={`/narrator/${n.narrator_id}`}
                          className="text-sm font-semibold text-green-900 hover:underline">
                          {n.abb_name || n.narrator_name}
                        </Link>
                        {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}</span>}
                        {n.city && <span className="text-xs text-gray-400">{n.city}</span>}
                        {n.grade && <span className={`text-xs ${gradeColor(n.grade)}`}>{n.grade.slice(0, 20)}</span>}
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-1">
                        <span>{n.hadith_count.toLocaleString('ar-EG')} حديث</span>
                        <span>{n.chain_count.toLocaleString('ar-EG')} سند</span>
                        <span>{n.book_count.toLocaleString('ar-EG')} كتاب</span>
                        <span>{n.companion_count.toLocaleString('ar-EG')} صحابي</span>
                        <span>{n.teacher_count.toLocaleString('ar-EG')} شيخ</span>
                        <span>{n.student_count.toLocaleString('ar-EG')} تلميذ</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-48">
                          <div className="bg-green-500 h-1.5 rounded-full"
                            style={{ width: `${(n.hub_score / maxScore) * 100}%` }} />
                        </div>
                        <span className="text-xs text-gray-400">مركزية: {n.hub_score.toLocaleString('ar-EG')}</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2 text-xs">
                      <Link href={`/narrator/${n.narrator_id}/reliability`}
                        className="text-gray-400 hover:text-blue-700">موثوقية</Link>
                      <Link href={`/narrator/${n.narrator_id}/students-list`}
                        className="text-gray-400 hover:text-green-700">تلاميذ</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bridge section */}
      {tab === 'bridge' && (
        <div>
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
            <strong>رواة الجسر</strong>: الرواة الذين يربطون بين أكبر عدد من الصحابة والكتب في آنٍ واحد.
            كل صحابي+كتاب = جسر مستقل — كلما زاد عدد الجسور زادت أهمية الراوي في تنويع مسارات الحديث.
          </div>
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="divide-y divide-gray-50">
              {bridges.map((n, i) => (
                <div key={n.narrator_id} className="px-4 py-3 hover:bg-blue-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-bold text-gray-400 w-6 shrink-0">
                      {(i + 1).toLocaleString('ar-EG')}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Link href={`/narrator/${n.narrator_id}`}
                          className="text-sm font-semibold text-blue-900 hover:underline">
                          {n.abb_name || n.narrator_name}
                        </Link>
                        {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}</span>}
                        {n.grade && <span className={`text-xs ${gradeColor(n.grade)}`}>{n.grade.slice(0, 20)}</span>}
                      </div>
                      <div className="flex gap-3 text-xs text-gray-500">
                        <span className="text-blue-700 font-medium">
                          {n.unique_companion_book_bridges.toLocaleString('ar-EG')} جسر فريد
                        </span>
                        <span>{n.chain_count.toLocaleString('ar-EG')} سند</span>
                      </div>
                    </div>
                    <div className="shrink-0 flex gap-2 text-xs">
                      <Link href={`/narrator/${n.narrator_id}`} className="text-gray-400 hover:text-blue-700">ترجمة</Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {(tab === 'hub' ? hubs : bridges).length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد نتائج بهذه المعايير — جرب تخفيف الشروط
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/network" className="text-green-700 hover:underline">← شبكة الأسانيد</Link>
        <Link href="/narrators/transmission-pairs" className="text-green-700 hover:underline">← أزواج الرواية</Link>
        <Link href="/narrators/prolific-by-century" className="text-green-700 hover:underline">← أبرز رواة القرن</Link>
      </div>
    </div>
  )
}
