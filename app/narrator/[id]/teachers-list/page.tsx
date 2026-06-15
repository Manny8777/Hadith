import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface TeacherRow {
  teacher_id: number
  teacher_name: string
  teacher_abb: string | null
  teacher_grade: string | null
  teacher_death: string | null
  teacher_city: string | null
  is_companion: boolean
  chain_count: number
  hadith_count: number
  book_count: number
  book_names: string | null
}

export default async function NarratorTeachersPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narId = parseInt(id)
  if (isNaN(narId)) notFound()

  const [narratorRes, teachersRes] = await Promise.all([
    pool.query<{ id: number; name: string; abb_name: string | null; death_year: string | null; martaba_ibn_hajar: string | null }>(
      `SELECT id, name, abb_name, death_year, martaba_ibn_hajar FROM narrators WHERE id = $1`,
      [narId]
    ).catch(() => ({ rows: [] })),

    pool.query<TeacherRow>(
      `SELECT
         n.id AS teacher_id,
         n.name AS teacher_name,
         n.abb_name AS teacher_abb,
         n.martaba_ibn_hajar AS teacher_grade,
         n.death_year AS teacher_death,
         n.city AS teacher_city,
         COALESCE(n.is_companion, false) AS is_companion,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         STRING_AGG(DISTINCT b.title, '، ' ORDER BY b.title) AS book_names
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord AS nar_pos
         FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1
         LIMIT 1
       ) pos
       JOIN narrators n ON n.id = ic.narrator_id_array[pos.nar_pos - 1]
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE $1 = ANY(ic.narrator_id_array)
         AND pos.nar_pos > 1
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar, n.death_year, n.city, n.is_companion
       ORDER BY hadith_count DESC
       LIMIT 80`,
      [narId]
    ).catch(() => ({ rows: [] as TeacherRow[] })),
  ])

  const narrator = narratorRes.rows[0]
  if (!narrator) notFound()

  const teachers = teachersRes.rows

  function gradeColor(grade: string | null, isComp: boolean) {
    if (isComp) return 'text-amber-700 bg-amber-50 border-amber-200'
    if (!grade) return 'text-gray-400 bg-gray-50 border-gray-100'
    if (/ثقة ثبت/.test(grade)) return 'text-green-800 bg-green-100 border-green-200'
    if (/ثقة/.test(grade)) return 'text-green-700 bg-green-50 border-green-100'
    if (/صدوق/.test(grade)) return 'text-blue-700 bg-blue-50 border-blue-100'
    if (/ضعيف|مجهول/.test(grade)) return 'text-red-700 bg-red-50 border-red-100'
    return 'text-gray-600 bg-gray-50 border-gray-100'
  }

  const maxHadiths = Math.max(...teachers.map(t => t.hadith_count), 1)
  const companionTeachers = teachers.filter(t => t.is_companion)
  const thiqaTeachers = teachers.filter(t => t.teacher_grade && /ثقة/.test(t.teacher_grade) && !t.is_companion)
  const totalHadiths = teachers.reduce((a, t) => a + t.hadith_count, 0)

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
          الشيوخ — روى عنهم
        </h1>
        <p className="text-sm text-gray-500">
          الرواة الذين روى عنهم {narrator.abb_name || narrator.name} في الأسانيد المسجَّلة
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'عدد الشيوخ', value: teachers.length.toLocaleString('ar-EG') },
          { label: 'إجمالي الأحاديث', value: totalHadiths.toLocaleString('ar-EG') },
          { label: 'روى عن الصحابة', value: companionTeachers.length.toLocaleString('ar-EG'), color: 'text-amber-700' },
          { label: 'شيوخه الثقات', value: thiqaTeachers.length.toLocaleString('ar-EG'), color: 'text-green-700' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-3 text-center">
            <div className={`text-xl font-bold ${s.color || 'text-green-900'}`}>{s.value}</div>
            <div className="text-xs text-gray-400">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Companion teachers highlighted */}
      {companionTeachers.length > 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4">
          <div className="text-xs text-amber-600 font-medium mb-2">الصحابة الذين روى عنهم مباشرةً:</div>
          <div className="flex flex-wrap gap-2">
            {companionTeachers.map(t => (
              <Link key={t.teacher_id} href={`/narrator/${t.teacher_id}`}
                className="text-xs bg-amber-100 text-amber-900 border border-amber-200 px-3 py-1 rounded-full hover:bg-amber-200 transition-colors">
                {t.teacher_abb || t.teacher_name}
                <span className="opacity-60 mr-1">({t.hadith_count})</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {teachers.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لم يُعثر على شيوخ لهذا الراوي في الأسانيد المسجَّلة
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
          <div className="divide-y divide-gray-50">
            {teachers.map((t, i) => (
              <div key={t.teacher_id}
                className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                <span className="text-xs text-gray-300 w-6 shrink-0 text-center">
                  {(i + 1).toLocaleString('ar-EG')}
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <Link href={`/narrator/${t.teacher_id}`}
                      className="font-semibold text-green-900 hover:underline text-sm">
                      {t.teacher_name}
                    </Link>
                    {(t.teacher_grade || t.is_companion) && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border ${gradeColor(t.teacher_grade, t.is_companion)}`}>
                        {t.is_companion ? 'صحابي' : t.teacher_grade}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                    {t.teacher_death && <span>ت {t.teacher_death}</span>}
                    {t.teacher_city && <span>• {t.teacher_city}</span>}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-3">
                  <div className="hidden sm:block">
                    <div className="w-20 bg-gray-100 rounded-full h-1.5">
                      <div className="bg-green-400 h-1.5 rounded-full"
                        style={{ width: `${(t.hadith_count / maxHadiths) * 100}%` }} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-medium text-green-800">
                      {t.hadith_count.toLocaleString('ar-EG')} ح
                    </div>
                    <div className="text-xs text-gray-400">
                      {t.book_count} كتاب
                    </div>
                  </div>
                  <Link href={`/narrator/${t.teacher_id}`}
                    className="text-xs text-green-600 hover:underline shrink-0 hidden sm:block">←</Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {teachers.length === 80 && (
        <div className="mt-2 text-xs text-gray-400 text-center">
          يُعرض أول 80 شيخاً الأكثر رواية فقط
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/narrator/${narId}`} className="text-green-700 hover:underline">← الراوي الكامل</Link>
        <Link href={`/narrator/${narId}/students-list`} className="text-green-700 hover:underline">← التلاميذ</Link>
        <Link href={`/narrator/${narId}/criticism-history`} className="text-green-700 hover:underline">← الجرح والتعديل</Link>
      </div>
    </div>
  )
}
