import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface DecadeStats {
  decade_start: number
  narrator_count: number
  companion_count: number
  avg_hadiths: number | null
  top_narrator_id: number | null
  top_narrator_name: string | null
  top_narrator_hadiths: number | null
}

interface NarratorInDecade {
  id: number
  name: string
  abb_name: string | null
  grade: string | null
  city: string | null
  is_companion: boolean
  hadith_count: number
  death_year_num: number
}

export default async function DeathDecadePage({
  searchParams,
}: {
  searchParams: Promise<{ decade?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedDecade = parseInt(sp.decade || '0') || null
  const limit = parseInt(sp.limit || '20')

  const [decadesRes, narratorsRes] = await Promise.all([
    pool.query<DecadeStats>(
      `SELECT
         (FLOOR(n.death_year_num / 10) * 10)::int AS decade_start,
         COUNT(*)::int AS narrator_count,
         COUNT(*) FILTER (WHERE n.is_companion)::int AS companion_count,
         ROUND(AVG(stats.hadith_count))::int AS avg_hadiths,
         (SELECT n2.id FROM narrators n2
          LEFT JOIN (SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hc
                     FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id GROUP BY ic.narrator_id_array[1]) s2 ON s2.nid = n2.id
          WHERE FLOOR(n2.death_year_num / 10) * 10 = FLOOR(n.death_year_num / 10) * 10
          ORDER BY COALESCE(s2.hc, 0) DESC LIMIT 1) AS top_narrator_id,
         (SELECT n2.abb_name || '' FROM narrators n2
          LEFT JOIN (SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hc
                     FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id GROUP BY ic.narrator_id_array[1]) s2 ON s2.nid = n2.id
          WHERE FLOOR(n2.death_year_num / 10) * 10 = FLOOR(n.death_year_num / 10) * 10
          ORDER BY COALESCE(s2.hc, 0) DESC LIMIT 1) AS top_narrator_name,
         (SELECT COALESCE(s2.hc, 0) FROM narrators n2
          LEFT JOIN (SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hc
                     FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id GROUP BY ic.narrator_id_array[1]) s2 ON s2.nid = n2.id
          WHERE FLOOR(n2.death_year_num / 10) * 10 = FLOOR(n.death_year_num / 10) * 10
          ORDER BY COALESCE(s2.hc, 0) DESC LIMIT 1) AS top_narrator_hadiths
       FROM narrators n
       LEFT JOIN (
         SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
         FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id GROUP BY ic.narrator_id_array[1]
       ) stats ON stats.nid = n.id
       WHERE n.death_year_num BETWEEN 1 AND 400
       GROUP BY FLOOR(n.death_year_num / 10) * 10
       ORDER BY decade_start`,
      []
    ).catch(() => ({ rows: [] as DecadeStats[] })),

    selectedDecade !== null ? pool.query<NarratorInDecade>(
      `SELECT
         n.id, n.name, n.abb_name, n.martaba_ibn_hajar AS grade, n.city, n.is_companion, n.death_year_num,
         COALESCE(stats.hadith_count, 0)::int AS hadith_count
       FROM narrators n
       LEFT JOIN (
         SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
         FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id GROUP BY ic.narrator_id_array[1]
       ) stats ON stats.nid = n.id
       WHERE n.death_year_num >= $1 AND n.death_year_num < $2
       ORDER BY COALESCE(stats.hadith_count, 0) DESC
       LIMIT $3`,
      [selectedDecade, selectedDecade + 10, limit]
    ).catch(() => ({ rows: [] as NarratorInDecade[] })) : Promise.resolve({ rows: [] as NarratorInDecade[] }),
  ])

  const decades = decadesRes.rows
  const narrators = narratorsRes.rows

  const maxCount = Math.max(...decades.map(d => d.narrator_count), 1)

  function gradeColor(g: string | null, isCompanion: boolean) {
    if (isCompanion) return 'text-amber-700'
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const LIMIT_OPTIONS = [10, 20, 30, 50]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة حسب عقد الوفاة</h1>
        <p className="text-sm text-gray-500">
          توزيع المحدثين على عقود الهجرة — يكشف أوج الطبقات وتركُّز النشاط الحديثي في كل فترة من فترات الإسلام
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <h2 className="font-bold text-green-900 text-sm mb-4">الخط الزمني للمحدثين — بالعقد الهجري</h2>
        <div className="space-y-1.5">
          {decades.map(d => {
            const isSelected = selectedDecade === d.decade_start
            const barPct = Math.round((d.narrator_count / maxCount) * 100)
            const century = Math.ceil((d.decade_start + 1) / 100)
            return (
              <a key={d.decade_start}
                href={`/narrators/death-decade?decade=${d.decade_start}&limit=${limit}`}
                className={`flex items-center gap-2 group hover:bg-gray-50 rounded-lg px-2 py-1 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                <span className={`text-xs shrink-0 w-20 ${isSelected ? 'text-green-700 font-bold' : 'text-gray-500'}`}>
                  {d.decade_start.toLocaleString('ar-EG')}—{(d.decade_start + 9).toLocaleString('ar-EG')}
                </span>
                <span className="text-xs text-gray-300 w-6 shrink-0">ق{century}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4 max-w-64">
                  <div className={`h-4 rounded-full transition-all ${isSelected ? 'bg-green-500' : 'bg-blue-300 group-hover:bg-blue-400'}`}
                    style={{ width: `${barPct}%` }} />
                </div>
                <span className={`text-xs font-medium shrink-0 w-10 text-left ${isSelected ? 'text-green-700' : 'text-gray-600'}`}>
                  {d.narrator_count.toLocaleString('ar-EG')}
                </span>
                {d.companion_count > 0 && (
                  <span className="text-xs text-amber-600 shrink-0">({d.companion_count}ص)</span>
                )}
                {d.top_narrator_name && (
                  <span className="text-xs text-gray-400 hidden sm:block shrink-0 max-w-32 truncate">
                    ↑ {d.top_narrator_name}
                  </span>
                )}
              </a>
            )
          })}
        </div>
      </div>

      {selectedDecade !== null && (
        <>
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <h2 className="font-bold text-green-900 text-sm">
              رواة العقد {selectedDecade.toLocaleString('ar-EG')}—{(selectedDecade + 9).toLocaleString('ar-EG')} هـ
            </h2>
            <div className="flex gap-1 flex-wrap">
              {LIMIT_OPTIONS.map(l => (
                <a key={l}
                  href={`/narrators/death-decade?decade=${selectedDecade}&limit=${l}`}
                  className={`text-xs px-2 py-1 rounded-full border ${limit === l ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {l}
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {narrators.map((n, i) => (
              <Link key={n.id}
                href={`/narrator/${n.id}`}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3 hover:border-green-200 hover:shadow-sm transition-all">
                <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm hover:underline ${n.is_companion ? 'text-amber-800' : 'text-green-900'}`}>
                      {n.abb_name || n.name.split(' ').slice(0, 3).join(' ')}
                    </span>
                    {n.is_companion && <span className="text-xs text-amber-600">صحابي</span>}
                    {n.grade && !n.is_companion && <span className={`text-xs ${gradeColor(n.grade, false)}`}>{n.grade.slice(0, 10)}</span>}
                  </div>
                  <div className="flex gap-2 text-xs text-gray-400 mt-0.5">
                    <span>ت {n.death_year_num.toLocaleString('ar-EG')} هـ</span>
                    {n.city && <span>{n.city.split(',')[0]}</span>}
                  </div>
                </div>
                <div className="text-xs text-green-700 font-medium shrink-0">
                  {n.hadith_count.toLocaleString('ar-EG')}
                </div>
              </Link>
            ))}
          </div>

          {narrators.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
              لا توجد بيانات لهذا العقد
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/chronology" className="text-green-700 hover:underline">← تسلسل الرواية</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← طبقات الرواة</Link>
        <Link href="/narrators/city-century" className="text-green-700 hover:underline">← المدن والقرون</Link>
      </div>
    </div>
  )
}
