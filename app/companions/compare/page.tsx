import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مقارنة الصحابة — جامع خادم الحرمين' }

interface CompanionBasic {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  death_year_num: number | null
  hadiths_count: number
}

interface CompanionDetail {
  id: number
  hadith_count: number
  chain_count: number
  book_count: number
  student_count: number
  sahih_count: number
  hasan_count: number
  topic_count: number
  top_books: string
  top_students: string
}

export default async function CompareCompanionsPage({
  searchParams,
}: {
  searchParams: Promise<{ c1?: string; c2?: string; q1?: string; q2?: string }>
}) {
  const sp = await searchParams
  const c1Id = parseInt(sp.c1 || '0')
  const c2Id = parseInt(sp.c2 || '0')
  const q1 = sp.q1 || ''
  const q2 = sp.q2 || ''

  // Load companion lists for autocomplete suggestions
  const [allCompanionsRes, comp1DetailRes, comp2DetailRes, sharedRes] = await Promise.all([
    pool.query<CompanionBasic>(
      `SELECT id, name, abb_name, death_year, death_year_num, COALESCE(hadiths_count, 0) AS hadiths_count
       FROM narrators WHERE is_companion = true
       ORDER BY hadiths_count DESC NULLS LAST LIMIT 50`
    ).catch(() => ({ rows: [] as CompanionBasic[] })),

    c1Id > 0 ? pool.query<CompanionDetail>(
      `SELECT
         n.id,
         (SELECT COUNT(DISTINCT ih.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          WHERE ic.narrator_id_array[1] = $1) AS hadith_count,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          WHERE ic.narrator_id_array[1] = $1) AS chain_count,
         (SELECT COUNT(DISTINCT ht.book_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1) AS book_count,
         (SELECT COUNT(DISTINCT ic.narrator_id_array[2])::int FROM isnad_chains ic
          WHERE ic.narrator_id_array[1] = $1
            AND array_length(ic.narrator_id_array, 1) >= 2) AS student_count,
         (SELECT COUNT(DISTINCT hj.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_judgments hj ON hj.hadith_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1 AND hj.say_text ~* '^صحيح|إسناده صحيح') AS sahih_count,
         (SELECT COUNT(DISTINCT hj.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_judgments hj ON hj.hadith_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1 AND hj.say_text ~* '^حسن|إسناده حسن') AS hasan_count,
         0 AS topic_count,
         (SELECT STRING_AGG(DISTINCT b.title, '، ' ORDER BY b.title) FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
          JOIN books b ON b.id = ht.book_id
          WHERE ic.narrator_id_array[1] = $1
          LIMIT 5) AS top_books,
         (SELECT STRING_AGG(DISTINCT n2.abb_name || ' (' || cnt || ')', '، ') FROM (
           SELECT ic.narrator_id_array[2] AS nid, COUNT(DISTINCT ic.id)::int AS cnt
           FROM isnad_chains ic WHERE ic.narrator_id_array[1] = $1
             AND array_length(ic.narrator_id_array, 1) >= 2
           GROUP BY ic.narrator_id_array[2] ORDER BY cnt DESC LIMIT 5
         ) top JOIN narrators n2 ON n2.id = top.nid) AS top_students
       FROM narrators n WHERE n.id = $1`,
      [c1Id]
    ).catch(() => ({ rows: [] as CompanionDetail[] })) : Promise.resolve({ rows: [] as CompanionDetail[] }),

    c2Id > 0 ? pool.query<CompanionDetail>(
      `SELECT
         n.id,
         (SELECT COUNT(DISTINCT ih.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          WHERE ic.narrator_id_array[1] = $1) AS hadith_count,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          WHERE ic.narrator_id_array[1] = $1) AS chain_count,
         (SELECT COUNT(DISTINCT ht.book_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1) AS book_count,
         (SELECT COUNT(DISTINCT ic.narrator_id_array[2])::int FROM isnad_chains ic
          WHERE ic.narrator_id_array[1] = $1
            AND array_length(ic.narrator_id_array, 1) >= 2) AS student_count,
         (SELECT COUNT(DISTINCT hj.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_judgments hj ON hj.hadith_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1 AND hj.say_text ~* '^صحيح|إسناده صحيح') AS sahih_count,
         (SELECT COUNT(DISTINCT hj.hadith_id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_judgments hj ON hj.hadith_id = ih.hadith_id
          WHERE ic.narrator_id_array[1] = $1 AND hj.say_text ~* '^حسن|إسناده حسن') AS hasan_count,
         0 AS topic_count,
         (SELECT STRING_AGG(DISTINCT b.title, '، ' ORDER BY b.title) FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
          JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
          JOIN books b ON b.id = ht.book_id
          WHERE ic.narrator_id_array[1] = $1
          LIMIT 5) AS top_books,
         (SELECT STRING_AGG(DISTINCT n2.abb_name || ' (' || cnt || ')', '، ') FROM (
           SELECT ic.narrator_id_array[2] AS nid, COUNT(DISTINCT ic.id)::int AS cnt
           FROM isnad_chains ic WHERE ic.narrator_id_array[1] = $1
             AND array_length(ic.narrator_id_array, 1) >= 2
           GROUP BY ic.narrator_id_array[2] ORDER BY cnt DESC LIMIT 5
         ) top JOIN narrators n2 ON n2.id = top.nid) AS top_students
       FROM narrators n WHERE n.id = $1`,
      [c2Id]
    ).catch(() => ({ rows: [] as CompanionDetail[] })) : Promise.resolve({ rows: [] as CompanionDetail[] }),

    // Shared students between two companions
    (c1Id > 0 && c2Id > 0) ? pool.query<{ student_name: string; student_id: number; c1_chains: number; c2_chains: number }>(
      `SELECT n.name AS student_name, n.id AS student_id,
              SUM(CASE WHEN ic.narrator_id_array[1] = $1 THEN 1 ELSE 0 END)::int AS c1_chains,
              SUM(CASE WHEN ic.narrator_id_array[1] = $2 THEN 1 ELSE 0 END)::int AS c2_chains
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[2]
       WHERE ic.narrator_id_array[1] = ANY(ARRAY[$1, $2]::int[])
         AND array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY n.id, n.name
       HAVING COUNT(DISTINCT ic.narrator_id_array[1]) = 2
       ORDER BY (c1_chains + c2_chains) DESC
       LIMIT 10`,
      [c1Id, c2Id]
    ).catch(() => ({ rows: [] })) : Promise.resolve({ rows: [] }),
  ])

  const companions = allCompanionsRes.rows
  const c1Info = companions.find(c => c.id === c1Id)
  const c2Info = companions.find(c => c.id === c2Id)
  const c1Detail = comp1DetailRes.rows[0]
  const c2Detail = comp2DetailRes.rows[0]
  const sharedStudents = sharedRes.rows

  const hasComparison = c1Id > 0 && c2Id > 0 && c1Detail && c2Detail

  function statBar(v1: number, v2: number) {
    const max = Math.max(v1, v2, 1)
    return {
      pct1: (v1 / max) * 100,
      pct2: (v2 / max) * 100,
      winner: v1 > v2 ? 1 : v2 > v1 ? 2 : 0
    }
  }

  const FAMOUS_COMPANIONS = companions.slice(0, 20)

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مقارنة الصحابة الرواة</h1>
        <p className="text-sm text-gray-500 mb-3">
          قارن بين صحابيَّين في عدد الأحاديث والأسانيد والتلاميذ والكتب — أداة لدراسة الحجم الروائي النسبي
        </p>
      </div>

      {/* Selection form */}
      <form action="/companions/compare" method="get" className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">الصحابي الأول</label>
            <select name="c1" defaultValue={c1Id || ''}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
              <option value="">اختر صحابياً...</option>
              {companions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.hadiths_count?.toLocaleString('ar-EG') || 0} ح)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">الصحابي الثاني</label>
            <select name="c2" defaultValue={c2Id || ''}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
              <option value="">اختر صحابياً...</option>
              {companions.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.hadiths_count?.toLocaleString('ar-EG') || 0} ح)
                </option>
              ))}
            </select>
          </div>
        </div>
        <button type="submit"
          className="mt-3 text-sm bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
          مقارنة
        </button>
      </form>

      {/* Quick comparison shortcuts */}
      <div className="flex flex-wrap gap-2 mb-5 text-xs">
        <span className="text-gray-400">مقارنات شهيرة:</span>
        {[
          { label: 'أبو هريرة vs ابن عمر', href: '/companions/compare?c1=&c2=' },
        ].map(ex => (
          <span key={ex.label} className="text-gray-400 bg-gray-50 px-2 py-1 rounded">
            {ex.label} — اختر من القائمة أعلاه
          </span>
        ))}
      </div>

      {hasComparison && c1Info && c2Info && (
        <div>
          {/* Header comparison */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { info: c1Info, detail: c1Detail, side: 'right', color: 'bg-green-50 border-green-200' },
              { info: c2Info, detail: c2Detail, side: 'left', color: 'bg-blue-50 border-blue-200' },
            ].map(({ info, detail, color }) => (
              <div key={info.id} className={`rounded-xl border p-4 ${color}`}>
                <Link href={`/narrator/${info.id}`}
                  className="font-bold text-green-900 hover:underline text-sm block mb-1">
                  {info.name}
                </Link>
                {info.death_year && (
                  <span className="text-xs text-gray-400">ت {info.death_year}</span>
                )}
                <div className="mt-2 text-xs text-gray-500">
                  {detail.hadith_count.toLocaleString('ar-EG')} حديث في الأسانيد
                </div>
              </div>
            ))}
          </div>

          {/* Stats comparison */}
          <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
            <h2 className="font-bold text-green-900 text-sm mb-3">المقارنة التفصيلية</h2>
            <div className="space-y-3">
              {[
                { label: 'عدد الأحاديث', v1: c1Detail.hadith_count, v2: c2Detail.hadith_count },
                { label: 'عدد الأسانيد', v1: c1Detail.chain_count, v2: c2Detail.chain_count },
                { label: 'عدد الكتب', v1: c1Detail.book_count, v2: c2Detail.book_count },
                { label: 'عدد التلاميذ المباشرين', v1: c1Detail.student_count, v2: c2Detail.student_count },
                { label: 'الأحاديث الصحيحة', v1: c1Detail.sahih_count, v2: c2Detail.sahih_count },
                { label: 'الأحاديث الحسنة', v1: c1Detail.hasan_count, v2: c2Detail.hasan_count },
              ].map(({ label, v1, v2 }) => {
                const bar = statBar(v1, v2)
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                      <span className={`font-bold ${bar.winner === 1 ? 'text-green-700' : 'text-gray-400'}`}>
                        {v1.toLocaleString('ar-EG')}
                      </span>
                      <span className="text-gray-600">{label}</span>
                      <span className={`font-bold ${bar.winner === 2 ? 'text-blue-700' : 'text-gray-400'}`}>
                        {v2.toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-2 flex justify-end overflow-hidden">
                        <div className="bg-green-500 h-2 rounded-full"
                          style={{ width: `${bar.pct1}%` }} />
                      </div>
                      <div className="w-2 shrink-0" />
                      <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                        <div className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${bar.pct2}%` }} />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Shared students */}
          {sharedStudents.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <h2 className="font-bold text-green-900 text-sm mb-3">
                التلاميذ المشتركون ({sharedStudents.length})
              </h2>
              <div className="space-y-1.5">
                {sharedStudents.map(s => (
                  <div key={s.student_id} className="flex items-center gap-2 text-xs">
                    <Link href={`/narrator/${s.student_id}`}
                      className="text-green-800 hover:underline font-medium w-32 truncate">
                      {s.student_name}
                    </Link>
                    <span className="text-green-600">{s.c1_chains} سند عن {c1Info.abb_name || c1Info.name}</span>
                    <span className="text-gray-300">|</span>
                    <span className="text-blue-600">{s.c2_chains} سند عن {c2Info.abb_name || c2Info.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top books per companion */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { name: c1Info.name, books: c1Detail.top_books, students: c1Detail.top_students, href: c1Info.id, color: 'bg-green-50' },
              { name: c2Info.name, books: c2Detail.top_books, students: c2Detail.top_students, href: c2Info.id, color: 'bg-blue-50' },
            ].map(({ name, books, students, href, color }) => (
              <div key={href} className={`rounded-xl border border-gray-100 p-3 ${color}`}>
                <h3 className="text-xs font-bold text-gray-700 mb-2">{name}</h3>
                {books && (
                  <div className="mb-2">
                    <div className="text-xs text-gray-400 mb-0.5">الكتب:</div>
                    <div className="text-xs text-gray-700">{books}</div>
                  </div>
                )}
                {students && (
                  <div>
                    <div className="text-xs text-gray-400 mb-0.5">أبرز التلاميذ:</div>
                    <div className="text-xs text-gray-700">{students}</div>
                  </div>
                )}
                <Link href={`/narrator/${href}`}
                  className="text-xs text-green-700 hover:underline block mt-2">
                  الصفحة الكاملة ←
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {!hasComparison && (c1Id > 0 || c2Id > 0) && (
        <div className="bg-yellow-50 rounded-xl p-4 text-sm text-yellow-800">
          اختر صحابيَّين من القائمة أعلاه لبدء المقارنة
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة الرواة</Link>
        <Link href="/companions/top-hadiths" className="text-green-700 hover:underline">← أشهر أحاديث الصحابة</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
      </div>
    </div>
  )
}
