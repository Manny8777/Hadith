import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مدارس الحديث الجغرافية — جامع خادم الحرمين' }

const SCHOOLS = [
  { key: 'المدينة',  label: 'مدرسة المدينة',  pattern: 'المدينة|يثرب|مدني',       color: 'green'  },
  { key: 'مكة',     label: 'مدرسة مكة',       pattern: 'مكة|مكي',                 color: 'amber'  },
  { key: 'الكوفة',  label: 'مدرسة الكوفة',    pattern: 'الكوفة|كوفي',             color: 'blue'   },
  { key: 'البصرة',  label: 'مدرسة البصرة',    pattern: 'البصرة|بصري',             color: 'teal'   },
  { key: 'الشام',   label: 'مدرسة الشام',     pattern: 'الشام|دمشق|شامي|دمشقي',  color: 'indigo' },
  { key: 'مصر',     label: 'مدرسة مصر',       pattern: 'مصر|مصري',                color: 'orange' },
  { key: 'خراسان',  label: 'مدرسة خراسان',    pattern: 'خراسان|نيسابور|مرو|هراة|بخارى|سمرقند', color: 'purple' },
  { key: 'اليمن',   label: 'مدرسة اليمن',     pattern: 'اليمن|صنعاء|يمني',        color: 'rose'   },
]

interface SchoolStat {
  school_key: string
  narrator_count: number
  thiqa_count: number
  hadith_count: number
  chain_count: number
  century_spread: number
  top_narrator: string
}

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  living_city: string | null
  martaba_ibn_hajar: string | null
  death_year_num: number | null
  hadith_count: number
  chain_count: number
}

export default async function HadithSchoolsPage({
  searchParams,
}: {
  searchParams: Promise<{ school?: string }>
}) {
  const sp = await searchParams
  const selectedSchool = sp.school || ''
  const schoolDef = SCHOOLS.find(s => s.key === selectedSchool)

  const [schoolStatsRes, narratorsRes] = await Promise.all([
    // Stats per school
    Promise.all(SCHOOLS.map(school =>
      pool.query<{
        narrator_count: number; thiqa_count: number;
        hadith_count: number; chain_count: number;
        century_spread: number; top_narrator: string
      }>(
        `SELECT
           COUNT(DISTINCT n.id)::int AS narrator_count,
           COUNT(DISTINCT n.id) FILTER (WHERE n.martaba_ibn_hajar ~* 'ثقة')::int AS thiqa_count,
           COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
           COUNT(DISTINCT ic.id)::int AS chain_count,
           COUNT(DISTINCT CEIL(n.death_year_num / 100.0)::int)::int AS century_spread,
           (SELECT n2.name FROM narrators n2
            JOIN isnad_chains ic2 ON n2.id = ANY(ic2.narrator_id_array)
            JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id
            WHERE n2.living_city ~* $1 AND NOT n2.is_companion
            GROUP BY n2.id, n2.name ORDER BY COUNT(DISTINCT ih2.hadith_id) DESC LIMIT 1) AS top_narrator
         FROM narrators n
         JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         WHERE n.living_city ~* $1
           AND NOT n.is_companion`,
        [school.pattern]
      ).catch(() => ({ rows: [{ narrator_count: 0, thiqa_count: 0, hadith_count: 0, chain_count: 0, century_spread: 0, top_narrator: '' }] }))
        .then(r => ({ ...r.rows[0], school_key: school.key }))
    )),

    // Narrators for selected school
    selectedSchool && schoolDef ? pool.query<NarratorRow>(
      `SELECT
         n.id, n.name, n.abb_name, n.living_city, n.martaba_ibn_hajar, n.death_year_num,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE n.living_city ~* $1
         AND NOT n.is_companion
       GROUP BY n.id, n.name, n.abb_name, n.living_city, n.martaba_ibn_hajar, n.death_year_num
       ORDER BY hadith_count DESC
       LIMIT 50`,
      [schoolDef.pattern]
    ).catch(() => ({ rows: [] as NarratorRow[] })) : Promise.resolve({ rows: [] as NarratorRow[] }),
  ])

  const schoolStats: (SchoolStat & { narrator_count: number })[] = schoolStatsRes.map((s, i) => ({
    ...s,
    school_key: SCHOOLS[i].key,
    narrator_count: s.narrator_count || 0,
    thiqa_count: s.thiqa_count || 0,
    hadith_count: s.hadith_count || 0,
    chain_count: s.chain_count || 0,
    century_spread: s.century_spread || 0,
    top_narrator: s.top_narrator || '',
  }))

  const narrators = narratorsRes.rows
  const maxHadiths = Math.max(...schoolStats.map(s => s.hadith_count), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة|ثبت|حجة/.test(g)) return 'text-green-700'
    if (/صدوق|مقبول/.test(g)) return 'text-blue-600'
    if (/ضعيف|منكر|متروك/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  function schoolColor(color: string) {
    const map: Record<string, { bg: string; border: string; text: string; bar: string }> = {
      green:  { bg: 'bg-green-50',  border: 'border-green-200',  text: 'text-green-900',  bar: 'bg-green-500'  },
      amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  text: 'text-amber-900',  bar: 'bg-amber-500'  },
      blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   text: 'text-blue-900',   bar: 'bg-blue-500'   },
      teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   text: 'text-teal-900',   bar: 'bg-teal-500'   },
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-900', bar: 'bg-indigo-500' },
      orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-900', bar: 'bg-orange-500' },
      purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-900', bar: 'bg-purple-500' },
      rose:   { bg: 'bg-rose-50',   border: 'border-rose-200',   text: 'text-rose-900',   bar: 'bg-rose-500'   },
    }
    return map[color] || map.green
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مدارس الحديث الجغرافية</h1>
        <p className="text-sm text-gray-500">
          توزيع الرواة على المراكز الكبرى لتلقي الحديث ونقله — المدينة والكوفة والبصرة والشام وما بعدها
        </p>
      </div>

      {/* School grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {SCHOOLS.map((school, i) => {
          const stat = schoolStats[i]
          const c = schoolColor(school.color)
          const isActive = selectedSchool === school.key
          return (
            <a key={school.key}
              href={isActive
                ? '/narrators/hadith-schools'
                : `/narrators/hadith-schools?school=${encodeURIComponent(school.key)}`}
              className={`rounded-xl border p-4 transition-all hover:shadow-sm ${
                isActive
                  ? `${c.bg} ${c.border} shadow-sm ring-2 ring-offset-1`
                  : `bg-white border-gray-100 hover:${c.border}`
              }`}>
              <div className={`font-bold text-sm mb-1 ${c.text}`}>{school.label}</div>
              {stat && (
                <>
                  <div className="text-xs text-gray-500 mb-2">
                    {stat.narrator_count.toLocaleString('ar-EG')} راوٍ ·{' '}
                    {stat.hadith_count.toLocaleString('ar-EG')} حديث
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5 mb-2">
                    <div className={`h-1.5 rounded-full ${c.bar}`}
                      style={{ width: `${(stat.hadith_count / maxHadiths) * 100}%` }} />
                  </div>
                  {stat.thiqa_count > 0 && (
                    <div className="text-xs text-gray-400">
                      {stat.thiqa_count.toLocaleString('ar-EG')} ثقة · {stat.century_spread} قرون
                    </div>
                  )}
                  {stat.top_narrator && (
                    <div className="text-xs text-gray-500 mt-1 truncate">
                      أبرزهم: {stat.top_narrator}
                    </div>
                  )}
                </>
              )}
            </a>
          )
        })}
      </div>

      {/* Comparison chart */}
      {!selectedSchool && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <h2 className="font-bold text-green-900 text-sm mb-3">مقارنة المدارس</h2>
          <div className="space-y-2">
            {SCHOOLS.map((school, i) => {
              const stat = schoolStats[i]
              const c = schoolColor(school.color)
              if (!stat || stat.narrator_count === 0) return null
              return (
                <div key={school.key} className="flex items-center gap-3">
                  <a href={`/narrators/hadith-schools?school=${encodeURIComponent(school.key)}`}
                    className={`text-xs font-medium w-28 shrink-0 ${c.text}`}>
                    {school.label}
                  </a>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div className={`h-2 rounded-full ${c.bar}`}
                      style={{ width: `${(stat.hadith_count / maxHadiths) * 100}%` }} />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0 w-24 text-left">
                    {stat.hadith_count.toLocaleString('ar-EG')} حديث
                  </span>
                  <span className="text-xs text-gray-300 shrink-0 w-16 text-left">
                    {stat.narrator_count.toLocaleString('ar-EG')} راوٍ
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected school narrators */}
      {selectedSchool && schoolDef && narrators.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className={`px-4 py-2.5 border-b border-gray-100 ${schoolColor(schoolDef.color).bg}`}>
            <span className={`text-sm font-bold ${schoolColor(schoolDef.color).text}`}>
              {schoolDef.label} — أبرز الرواة ({narrators.length})
            </span>
          </div>
          <div className="divide-y divide-gray-50">
            {narrators.map((n, i) => (
              <div key={n.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50">
                <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/narrator/${n.id}`}
                      className="text-sm font-medium text-green-900 hover:underline">
                      {n.abb_name || n.name}
                    </Link>
                    {n.death_year_num && <span className="text-xs text-gray-400">ت {n.death_year_num}</span>}
                    {n.living_city && <span className="text-xs text-gray-400">{n.living_city}</span>}
                    {n.martaba_ibn_hajar && <span className={`text-xs ${gradeColor(n.martaba_ibn_hajar)}`}>{n.martaba_ibn_hajar.slice(0, 20)}</span>}
                  </div>
                </div>
                <div className="text-xs text-gray-500 shrink-0">
                  {n.hadith_count.toLocaleString('ar-EG')} ح
                </div>
                <div className="shrink-0 flex gap-2 text-xs">
                  <Link href={`/narrator/${n.id}`} className="text-gray-400 hover:text-green-700">ترجمة</Link>
                  <Link href={`/narrator/${n.id}/reliability`} className="text-gray-400 hover:text-blue-700">موثوقية</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/chronology" className="text-green-700 hover:underline">← تسلسل الرواية</Link>
        <Link href="/narrators/city-century" className="text-green-700 hover:underline">← المدن والقرون</Link>
        <Link href="/narrators/prolific-by-century" className="text-green-700 hover:underline">← أبرز رواة القرن</Link>
      </div>
    </div>
  )
}
