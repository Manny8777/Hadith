import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface StudentRow {
  student_id: number
  student_name: string
  student_abb: string | null
  student_grade: string | null
  student_death: string | null
  student_death_num: number | null
  student_city: string | null
  is_companion: boolean
  chain_count: number
  hadith_count: number
  book_count: number
  book_names: string | null
}

export default async function NarratorStudentsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narId = parseInt(id)
  if (isNaN(narId)) notFound()

  const [narratorRes, studentsRes, positionRes] = await Promise.all([
    pool.query<{ id: number; name: string; abb_name: string | null; death_year: string | null; martaba_ibn_hajar: string | null }>(
      `SELECT id, name, abb_name, death_year, martaba_ibn_hajar FROM narrators WHERE id = $1`,
      [narId]
    ).catch(() => ({ rows: [] })),

    pool.query<StudentRow>(
      // التلاميذ tab of the original = NounsShyoukhTalamize reversed → narrator_teachers (parity-exact)
      `SELECT
         n.id AS student_id,
         n.name AS student_name,
         n.abb_name AS student_abb,
         n.martaba_ibn_hajar AS student_grade,
         n.death_year AS student_death,
         n.death_year_num AS student_death_num,
         COALESCE(n.birth_city, n.death_city) AS student_city,
         COALESCE(n.is_companion, false) AS is_companion,
         0::int AS chain_count,
         nt.hadiths_count::int AS hadith_count,
         0::int AS book_count,
         NULL::text AS book_names
       FROM narrator_teachers nt
       JOIN narrators n ON n.id = nt.rawy_id
       WHERE nt.shyoukh_id = $1
       ORDER BY nt.hadiths_count DESC, n.name
       LIMIT 80`,
      [narId]
    ).catch(() => ({ rows: [] as StudentRow[] })),

    // Find which positions this narrator occupies
    pool.query<{ pos: number; chain_count: number }>(
      `SELECT t.ord::int AS pos, COUNT(DISTINCT ic.id)::int AS chain_count
       FROM isnad_chains ic,
            unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
       WHERE t.nid = $1
       GROUP BY t.ord
       ORDER BY t.ord`,
      [narId]
    ).catch(() => ({ rows: [] })),
  ])

  const narrator = narratorRes.rows[0]
  if (!narrator) notFound()

  const students = studentsRes.rows
  const positions = positionRes.rows

  function gradeColor(grade: string | null, isComp: boolean) {
    if (isComp) return 'text-amber-700 bg-amber-50 border-amber-200'
    if (!grade) return 'text-gray-400 bg-gray-50 border-gray-100'
    if (/ثقة ثبت/.test(grade)) return 'text-green-800 bg-green-100 border-green-200'
    if (/ثقة/.test(grade)) return 'text-green-700 bg-green-50 border-green-100'
    if (/صدوق/.test(grade)) return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف|مجهول/.test(grade)) return 'text-red-700 bg-red-50 border-red-100'
    return 'text-gray-600 bg-gray-50 border-gray-100'
  }

  const maxHadiths = Math.max(...students.map(s => s.hadith_count), 1)
  const totalHadiths = students.reduce((a, s) => a + s.hadith_count, 0)
  const thiqaStudents = students.filter(s => s.student_grade && /ثقة/.test(s.student_grade) && !s.is_companion)
  const weakStudents = students.filter(s => s.student_grade && /ضعيف|مجهول/.test(s.student_grade))

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <Link href={`/narrator/${narId}`}
            className="text-green-700 hover:underline font-bold text-lg">
            {narrator.name}
          </Link>
          {narrator.death_year && (
            <span className="text-sm text-gray-400">ت {narrator.death_year}</span>
          )}
          {narrator.martaba_ibn_hajar && (
            <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full">
              {narrator.martaba_ibn_hajar}
            </span>
          )}
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-1">
          التلاميذ — من روى عنه
        </h1>
        <p className="text-sm text-gray-500">
          الرواة الذين رووا عن {narrator.abb_name || narrator.name} — قائمة التلاميذ ومروياتهم في الموسوعة
        </p>
      </div>

      {/* Position stats */}
      {positions.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4 flex flex-wrap gap-4">
          <div className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">يظهر في الإسناد في موضع: </span>
            {positions.map(p => (
              <span key={p.pos} className="ml-1 inline-block bg-green-50 border border-green-100 text-green-800 px-2 py-0.5 rounded-full">
                {p.pos} ({p.chain_count.toLocaleString('ar-EG')} سند)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'عدد التلاميذ', value: students.length.toLocaleString('ar-EG') },
          { label: 'إجمالي الأحاديث', value: totalHadiths.toLocaleString('ar-EG') },
          { label: 'الثقات منهم', value: thiqaStudents.length.toLocaleString('ar-EG'), color: 'text-green-700' },
          { label: 'الضعفاء منهم', value: weakStudents.length.toLocaleString('ar-EG'), color: 'text-red-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className={`text-xl font-bold ${s.color || 'text-green-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {students.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لم يُعثر على تلاميذ لهذا الراوي في الأسانيد المسجَّلة
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {students.map((s, i) => (
              <div key={s.student_id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-300 w-6 shrink-0 text-center">
                  {(i + 1).toLocaleString('ar-EG')}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link href={`/narrator/${s.student_id}`}
                      className="font-semibold text-green-900 hover:underline text-sm">
                      {s.student_name}
                    </Link>
                    {s.student_grade && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${gradeColor(s.student_grade, s.is_companion)}`}>
                        {s.is_companion ? 'صحابي' : s.student_grade}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                    {s.student_death && <span>ت {s.student_death}</span>}
                    {s.student_city && <span>• {s.student_city}</span>}
                    {s.book_names && (
                      <span className="text-gray-300">• {s.book_names.length > 60
                        ? s.book_names.slice(0, 60) + '...'
                        : s.book_names}</span>
                    )}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <div className="hidden sm:block">
                    <div className="w-20 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-green-400 h-1.5 rounded-full"
                        style={{ width: `${(s.hadith_count / maxHadiths) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-green-800">
                      {s.hadith_count.toLocaleString('ar-EG')} ح
                    </div>
                    {s.book_count > 0 && (
                      <div className="text-xs text-gray-400">
                        {s.book_count} كتاب
                      </div>
                    )}
                  </div>
                  <Link href={`/narrator/${s.student_id}`}
                    className="text-xs text-green-600 hover:underline shrink-0 hidden sm:block">←</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {students.length === 80 && (
        <div className="mt-2 text-xs text-gray-400 text-center">
          يُعرض أول 80 تلميذاً الأكثر رواية فقط
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/narrator/${narId}`} className="text-green-700 hover:underline">← الراوي الكامل</Link>
        <Link href={`/narrator/${narId}/criticism-history`} className="text-green-700 hover:underline">← الجرح والتعديل</Link>
        <Link href="/narrators/transmission-pairs" className="text-green-700 hover:underline">← أزواج الرواية</Link>
      </div>
    </div>
  )
}
