import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مسار نقل الحديث — جامع خادم الحرمين' }

interface PathRow {
  hadith_id: number
  hadith_text: string
  book_name: string
  chain_id: number
  narrator_ids: number[]
  narrator_names: string[]
  narrator_grades: (string | null)[]
  pos_a: number
  pos_b: number
}

interface NarratorOption {
  id: number
  name: string
  abb_name: string | null
  hadiths_count: number
}

export default async function TransmissionPathPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; qa?: string; qb?: string }>
}) {
  const sp = await searchParams
  const narA = parseInt(sp.a || '0')
  const narB = parseInt(sp.b || '0')
  const qa = sp.qa || ''
  const qb = sp.qb || ''

  const [suggestionsARes, suggestionsBRes, narratorARes, narratorBRes, pathsRes] = await Promise.all([
    // Suggestions for narrator A
    qa.length >= 2 ? pool.query<NarratorOption>(
      `SELECT id, name, abb_name, COALESCE(hadiths_count, 0) AS hadiths_count
       FROM narrators WHERE name ~* $1 OR abb_name ~* $1
       ORDER BY hadiths_count DESC NULLS LAST LIMIT 8`,
      [qa]
    ).catch(() => ({ rows: [] as NarratorOption[] })) : Promise.resolve({ rows: [] as NarratorOption[] }),

    qa.length >= 2 ? pool.query<NarratorOption>(
      `SELECT id, name, abb_name, COALESCE(hadiths_count, 0) AS hadiths_count
       FROM narrators WHERE name ~* $1 OR abb_name ~* $1
       ORDER BY hadiths_count DESC NULLS LAST LIMIT 8`,
      [qb]
    ).catch(() => ({ rows: [] as NarratorOption[] })) : Promise.resolve({ rows: [] as NarratorOption[] }),

    narA > 0 ? pool.query<{ id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; death_year: string | null }>(
      `SELECT id, name, abb_name, martaba_ibn_hajar, death_year_num AS death_year FROM narrators WHERE id = $1`, [narA]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

    narB > 0 ? pool.query<{ id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; death_year: string | null }>(
      `SELECT id, name, abb_name, martaba_ibn_hajar, death_year_num AS death_year FROM narrators WHERE id = $1`, [narB]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),

    // Find chains where A appears before B
    (narA > 0 && narB > 0) ? pool.query<PathRow>(
      `SELECT
         ih.hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name,
         ic.id AS chain_id,
         ic.narrator_id_array AS narrator_ids,
         ARRAY(SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_names,
         ARRAY(SELECT n.martaba_ibn_hajar FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord) AS narrator_grades,
         pos_a.ord::int AS pos_a,
         pos_b.ord::int AS pos_b
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) pos_a
       CROSS JOIN LATERAL (
         SELECT ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $2 LIMIT 1
       ) pos_b
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE $1 = ANY(ic.narrator_id_array)
         AND $2 = ANY(ic.narrator_id_array)
         AND pos_a.ord < pos_b.ord
       ORDER BY (pos_b.ord - pos_a.ord) ASC, ih.hadith_id
       LIMIT 20`,
      [narA, narB]
    ).catch(() => ({ rows: [] as PathRow[] })) : Promise.resolve({ rows: [] as PathRow[] }),
  ])

  const suggestionsA = suggestionsARes.rows
  const suggestionsB = suggestionsBRes.rows
  const narratorA = narratorARes.rows[0]
  const narratorB = narratorBRes.rows[0]
  const paths = pathsRes.rows

  function gradeColor(grade: string | null): string {
    if (!grade) return 'text-gray-500 bg-gray-50'
    if (/ثقة ثبت|إمام/.test(grade)) return 'text-green-800 bg-green-100'
    if (/ثقة/.test(grade)) return 'text-green-700 bg-green-50'
    if (/صدوق/.test(grade)) return 'text-blue-700 bg-blue-50'
    if (/ضعيف|مجهول/.test(grade)) return 'text-red-700 bg-red-50'
    return 'text-gray-600 bg-gray-50'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مسار نقل الحديث بين الرواة</h1>
        <p className="text-sm text-gray-500">
          ابحث عن الأسانيد التي تمر من راوٍ معين إلى راوٍ آخر — يكشف مسارات انتقال الحديث وعلاقة التحديث المباشرة وغير المباشرة
        </p>
      </div>

      {/* Search form */}
      <form action="/narrators/transmission-path" method="get"
        className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">الراوي الأول (المُعطي — الأعلى في السند)</label>
            {narratorA ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-green-900 font-medium">
                  {narratorA.name}
                  {narratorA.death_year && <span className="text-gray-400 mr-1 font-normal">ت {narratorA.death_year}</span>}
                </span>
                <a href={`/narrators/transmission-path?b=${narB}`}
                  className="text-xs text-gray-400 hover:text-gray-600">تغيير</a>
                <input type="hidden" name="a" value={narA} />
              </div>
            ) : (
              <div>
                <input type="text" name="qa" defaultValue={qa}
                  placeholder="ابحث عن اسم الراوي..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
                {suggestionsA.length > 0 && (
                  <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto border border-gray-100 rounded-lg bg-white p-1">
                    {suggestionsA.map(n => (
                      <a key={n.id}
                        href={`/narrators/transmission-path?a=${n.id}&b=${narB}&qa=${encodeURIComponent(n.name)}&qb=${encodeURIComponent(sp.qb || '')}`}
                        className="block text-sm text-green-900 px-2 py-1 rounded hover:bg-green-50">
                        {n.name}
                        <span className="text-xs text-gray-400 mr-1">{n.hadiths_count} ح</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">الراوي الثاني (الآخذ — الأدنى في السند)</label>
            {narratorB ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-blue-900 font-medium">
                  {narratorB.name}
                  {narratorB.death_year && <span className="text-gray-400 mr-1 font-normal">ت {narratorB.death_year}</span>}
                </span>
                <a href={`/narrators/transmission-path?a=${narA}`}
                  className="text-xs text-gray-400 hover:text-gray-600">تغيير</a>
                <input type="hidden" name="b" value={narB} />
              </div>
            ) : (
              <div>
                <input type="text" name="qb" defaultValue={qb}
                  placeholder="ابحث عن اسم الراوي..."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-blue-400" />
                {suggestionsB.length > 0 && (
                  <div className="mt-1 space-y-0.5 max-h-40 overflow-y-auto border border-gray-100 rounded-lg bg-white p-1">
                    {suggestionsB.map(n => (
                      <a key={n.id}
                        href={`/narrators/transmission-path?a=${narA}&b=${n.id}&qa=${encodeURIComponent(sp.qa || '')}&qb=${encodeURIComponent(n.name)}`}
                        className="block text-sm text-blue-900 px-2 py-1 rounded hover:bg-blue-50">
                        {n.name}
                        <span className="text-xs text-gray-400 mr-1">{n.hadiths_count} ح</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <button type="submit"
          className="text-sm bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors">
          بحث
        </button>
      </form>

      {/* Example searches */}
      {!narA && !narB && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4 text-sm text-amber-800">
          <div className="font-medium mb-2">كيفية الاستخدام:</div>
          <p className="text-xs text-amber-700 leading-relaxed">
            أدخل اسم صحابي (مثال: "أبو هريرة") في الحقل الأول، ثم اسم تابعي (مثال: "الزهري") في الحقل الثاني.
            ستظهر جميع الأسانيد التي فيها الأول يروي عنه الثاني مباشرةً أو بواسطة.
          </p>
        </div>
      )}

      {/* Results */}
      {narA > 0 && narB > 0 && (
        <div>
          <div className="text-xs text-gray-400 mb-3">
            {paths.length === 0
              ? 'لا توجد أسانيد مباشرة أو غير مباشرة بين هذَين الراويَين'
              : `${paths.length === 20 ? 'أول 20' : paths.length} سند ${paths.length === 1 ? 'يمر' : 'تمر'} من ${narratorA?.abb_name || narratorA?.name} إلى ${narratorB?.abb_name || narratorB?.name}`}
          </div>

          <div className="space-y-4">
            {paths.map((path, pi) => {
              const sliceStart = Math.max(0, path.pos_a - 1)
              const sliceEnd = Math.min(path.narrator_names.length, path.pos_b)
              const relevantNames = path.narrator_names.slice(sliceStart, sliceEnd)
              const relevantIds = path.narrator_ids.slice(sliceStart, sliceEnd)
              const relevantGrades = path.narrator_grades.slice(sliceStart, sliceEnd)
              const steps = path.pos_b - path.pos_a

              return (
                <div key={`${path.chain_id}-${pi}`}
                  className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-colors">
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="text-xs bg-green-50 text-green-700 border border-green-100 px-2 py-0.5 rounded-full">
                      {steps === 1 ? 'مباشر' : `${steps} حلقات`}
                    </span>
                    <span className="text-xs text-gray-400">{path.book_name}</span>
                    <Link href={`/hadith/${path.hadith_id}`}
                      className="text-xs text-green-700 hover:underline mr-auto">
                      الحديث ←
                    </Link>
                  </div>

                  {/* Chain segment */}
                  <div className="flex flex-wrap items-center gap-1 mb-3">
                    {relevantNames.map((name, ni) => (
                      <div key={ni} className="flex items-center gap-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${ni === 0 ? 'bg-green-100 text-green-800' :
                            ni === relevantNames.length - 1 ? 'bg-blue-100 text-blue-800' :
                            gradeColor(relevantGrades[ni])}`}>
                          <Link href={`/narrator/${relevantIds[ni]}`}
                            className="hover:underline">
                            {name}
                          </Link>
                        </span>
                        {ni < relevantNames.length - 1 && (
                          <span className="text-gray-300 text-xs">←</span>
                        )}
                      </div>
                    ))}
                    {path.pos_a > 1 && (
                      <span className="text-xs text-gray-300 mr-1">(+ {path.pos_a - 1} قبله)</span>
                    )}
                    {path.pos_b < path.narrator_names.length && (
                      <span className="text-xs text-gray-300 mr-1">(+ {path.narrator_names.length - path.pos_b} بعده)</span>
                    )}
                  </div>

                  <p className="text-sm text-gray-700 leading-relaxed line-clamp-2">
                    {path.hadith_text}
                    {path.hadith_text?.length === 200 && '...'}
                  </p>
                </div>
              )
            })}
          </div>

          {paths.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
              لا توجد أسانيد مسجَّلة تجمع هذَين الراويَين بهذا الترتيب
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/chain-filter" className="text-green-700 hover:underline">← تتبع الإسناد</Link>
        <Link href="/narrators/transmission-pairs" className="text-green-700 hover:underline">← أزواج الرواية</Link>
      </div>
    </div>
  )
}
