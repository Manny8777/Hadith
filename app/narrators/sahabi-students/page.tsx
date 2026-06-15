import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface CompanionStudents {
  companion_id: number
  companion_name: string
  companion_death: string | null
  total_hadiths: number
  unique_students: number
  student_names: string
}

interface StudentDetail {
  student_id: number
  student_name: string
  student_abb: string | null
  student_death: string | null
  student_grade: string | null
  hadith_count: number
  is_companion: boolean
}

export default async function SahabiStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const limitCount = parseInt(sp.limit || '20')

  const [companionsRes, studentsRes] = await Promise.all([
    pool.query<CompanionStudents>(
      `SELECT
         n.id AS companion_id,
         n.name AS companion_name,
         n.death_year_num AS companion_death,
         COUNT(DISTINCT ih.hadith_id)::int AS total_hadiths,
         COUNT(DISTINCT ic.narrator_id_array[2])::int AS unique_students,
         STRING_AGG(DISTINCT n2.name, '، ' ORDER BY n2.name) FILTER (
           WHERE n2.id = ic.narrator_id_array[2]
         ) AS student_names
       FROM narrators n
       JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id AND n.is_companion = true
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       LEFT JOIN narrators n2 ON n2.id = ic.narrator_id_array[2]
       GROUP BY n.id, n.name, n.death_year_num
       HAVING COUNT(DISTINCT ih.hadith_id) >= 20
       ORDER BY COUNT(DISTINCT ic.narrator_id_array[2]) DESC
       LIMIT 40`,
      []
    ).catch(() => ({ rows: [] as CompanionStudents[] })),

    selectedId ? pool.query<StudentDetail>(
      `SELECT
         n2.id AS student_id,
         n2.name AS student_name,
         n2.abb_name AS student_abb,
         n2.death_year_num AS student_death,
         n2.martaba_ibn_hajar AS student_grade,
         n2.is_companion,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[2]
       WHERE ic.narrator_id_array[1] = $1
         AND ic.narrator_id_array[2] IS NOT NULL
       GROUP BY n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion
       ORDER BY COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT $2`,
      [selectedId, limitCount]
    ).catch(() => ({ rows: [] as StudentDetail[] })) : Promise.resolve({ rows: [] as StudentDetail[] }),
  ])

  const companions = companionsRes.rows
  const students = studentsRes.rows
  const selected = selectedId ? companions.find(c => c.companion_id === selectedId) : null

  const maxStudents = Math.max(...companions.map(c => c.unique_students), 1)
  const maxHadiths = Math.max(...students.map(s => s.hadith_count), 1)

  function gradeColor(g: string | null) {
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
        <h1 className="text-2xl font-bold text-green-900 mb-1">شبكة تلاميذ الصحابة</h1>
        <p className="text-sm text-gray-500">
          أبرز الصحابة بعدد تلاميذهم المباشرين — يكشف من كان أوسعهم تأثيراً في نشر الحديث وأكثرهم طلاباً في الجيل الثاني
        </p>
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
            <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium">
              الصحابة — بعدد التلاميذ
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {companions.map((c, i) => (
                <a key={c.companion_id}
                  href={`/narrators/sahabi-students?id=${c.companion_id}&limit=${limitCount}`}
                  className={`px-3 py-2.5 flex items-center gap-2 hover:bg-amber-50 transition-colors ${selectedId === c.companion_id ? 'bg-amber-50' : ''}`}>
                  <span className="text-xs text-gray-300 w-4 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${selectedId === c.companion_id ? 'text-amber-900' : 'text-green-900'} hover:underline`}>
                      {c.companion_name.split(' ').slice(0, 3).join(' ')}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1">
                        <div className="bg-amber-400 h-1 rounded-full"
                          style={{ width: `${(c.unique_students / maxStudents) * 100}%` }} />
                      </div>
                      <span className="text-xs text-amber-700 shrink-0">{c.unique_students} تلميذ</span>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          {selected ? (
            <>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
                <h2 className="font-bold text-amber-900 text-base">{selected.companion_name}</h2>
                <div className="flex gap-4 mt-2 text-sm flex-wrap">
                  {selected.companion_death && <span className="text-gray-500">ت {selected.companion_death}</span>}
                  <span className="text-amber-700 font-medium">{selected.unique_students} تلميذ مباشر</span>
                  <span className="text-gray-500">{selected.total_hadiths.toLocaleString('ar-EG')} حديث</span>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap items-center">
                  <span className="text-xs text-gray-500">عرض:</span>
                  {LIMIT_OPTIONS.map(l => (
                    <a key={l}
                      href={`/narrators/sahabi-students?id=${selectedId}&limit=${l}`}
                      className={`text-xs px-2 py-1 rounded-full border ${limitCount === l ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-200'}`}>
                      {l} أوائل
                    </a>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                {students.map((s, si) => (
                  <div key={s.student_id}
                    className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                    <span className="text-xs text-gray-300 w-5 shrink-0">{(si + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link href={`/narrator/${s.student_id}`}
                          className={`text-sm font-medium hover:underline ${s.is_companion ? 'text-amber-800' : 'text-green-900'}`}>
                          {s.student_abb || s.student_name.split(' ').slice(0, 3).join(' ')}
                        </Link>
                        {s.is_companion && <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">صحابي</span>}
                        {s.student_death && <span className="text-xs text-gray-400">ت {s.student_death}</span>}
                        {s.student_grade && !s.is_companion && (
                          <span className={`text-xs ${gradeColor(s.student_grade)}`}>{s.student_grade.slice(0, 15)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-left shrink-0 w-24">
                      <div className="bg-gray-100 rounded-full h-1.5 mb-0.5">
                        <div className="bg-green-400 h-1.5 rounded-full"
                          style={{ width: `${(s.hadith_count / maxHadiths) * 100}%` }} />
                      </div>
                      <div className="text-xs text-green-700 font-medium text-left">
                        {s.hadith_count.toLocaleString('ar-EG')} حديث
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="bg-amber-50 rounded-xl p-8 text-center">
              <div className="text-amber-300 text-4xl mb-3">←</div>
              <p className="text-sm text-amber-700">اختر صحابياً من القائمة لعرض شبكة تلاميذه المباشرين</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
        <Link href="/narrators/generation-bridge" className="text-green-700 hover:underline">← رواة الجسور</Link>
      </div>
    </div>
  )
}
