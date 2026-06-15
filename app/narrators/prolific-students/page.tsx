import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ProlificStudent {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  death_year_num: number | null
  grade: string | null
  city: string | null
  is_companion: boolean
  unique_teachers: number
  companion_teachers: number
  total_hadiths: number
  book_count: number
}

interface TeacherDetail {
  teacher_id: number
  teacher_name: string
  teacher_abb: string | null
  teacher_death: string | null
  teacher_grade: string | null
  is_companion: boolean
  chain_count: number
}

export default async function ProlificStudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sort?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const sortBy = sp.sort || 'teachers'
  const limit = parseInt(sp.limit || '30')

  const orderSql = sortBy === 'companions' ? 'companion_teachers DESC'
    : sortBy === 'hadiths' ? 'total_hadiths DESC'
    : 'unique_teachers DESC'

  const [studentsRes, teachersRes] = await Promise.all([
    pool.query<ProlificStudent>(
      `SELECT
         n.id, n.name, n.abb_name, n.death_year_num::text AS death_year, n.death_year_num, n.martaba_ibn_hajar AS grade, n.death_city AS city, n.is_companion,
         COUNT(DISTINCT ic.narrator_id_array[pos.ord - 1])::int AS unique_teachers,
         COUNT(DISTINCT ic.narrator_id_array[pos.ord - 1]) FILTER (
           WHERE (SELECT n2.is_companion FROM narrators n2 WHERE n2.id = ic.narrator_id_array[pos.ord - 1]) = true
         )::int AS companion_teachers,
         COUNT(DISTINCT ih.hadith_id)::int AS total_hadiths,
         COUNT(DISTINCT ht.book_id)::int AS book_count
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = n.id AND t.ord > 1 LIMIT 1
       ) pos
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE ic.narrator_id_array[pos.ord - 1] IS NOT NULL
         AND n.death_year_num IS NOT NULL
       GROUP BY n.id, n.name, n.abb_name, n.death_year_num, n.martaba_ibn_hajar, n.death_city, n.is_companion
       HAVING COUNT(DISTINCT ic.narrator_id_array[pos.ord - 1]) >= 5
       ORDER BY ${orderSql}
       LIMIT $1`,
      [limit]
    ).catch(() => ({ rows: [] as ProlificStudent[] })),

    selectedId ? pool.query<TeacherDetail>(
      `SELECT
         n2.id AS teacher_id,
         n2.name AS teacher_name,
         n2.abb_name AS teacher_abb,
         n2.death_year_num::text AS teacher_death,
         n2.martaba_ibn_hajar AS teacher_grade,
         n2.is_companion,
         COUNT(DISTINCT ic.id)::int AS chain_count
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 AND t.ord > 1 LIMIT 1
       ) pos
       JOIN narrators n2 ON n2.id = ic.narrator_id_array[pos.ord - 1]
       WHERE $1 = ANY(ic.narrator_id_array)
       GROUP BY n2.id, n2.name, n2.abb_name, n2.death_year_num, n2.martaba_ibn_hajar, n2.is_companion
       ORDER BY n2.is_companion DESC, COUNT(DISTINCT ic.id) DESC
       LIMIT 30`,
      [selectedId]
    ).catch(() => ({ rows: [] as TeacherDetail[] })) : Promise.resolve({ rows: [] as TeacherDetail[] }),
  ])

  const students = studentsRes.rows
  const teachers = teachersRes.rows
  const selected = selectedId ? students.find(s => s.id === selectedId) : null

  const maxTeachers = Math.max(...students.map(s => s.unique_teachers), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  const SORT_OPTIONS = [
    { key: 'teachers', label: 'بعدد الشيوخ' },
    { key: 'companions', label: 'بشيوخ الصحابة' },
    { key: 'hadiths', label: 'بعدد الأحاديث' },
  ]

  const LIMIT_OPTIONS = [20, 30, 50]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أكثر الرواة شيوخاً — المكثرون من التحمل</h1>
        <p className="text-sm text-gray-500">
          رواة تتلمذوا على أكبر عدد من الشيوخ المختلفين — يكشف من كان أوسعهم في طلب العلم وتحمُّل الرواية من مصادر متعددة
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/narrators/prolific-students?sort=${s.key}&limit=${limit}${selectedId ? `&id=${selectedId}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {LIMIT_OPTIONS.map(l => (
          <a key={l}
            href={`/narrators/prolific-students?sort=${sortBy}&limit=${l}${selectedId ? `&id=${selectedId}` : ''}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${limit === l ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-blue-50 px-4 py-2 border-b border-blue-100 text-xs text-blue-800 font-medium">
              المكثرون من الأخذ عن الشيوخ — ترتيب: {SORT_OPTIONS.find(s => s.key === sortBy)?.label}
            </div>
            <div className="divide-y divide-gray-50">
              {students.map((s, i) => (
                <a key={s.id}
                  href={`/narrators/prolific-students?sort=${sortBy}&limit=${limit}&id=${s.id}`}
                  className={`px-4 py-3 flex items-center gap-3 hover:bg-blue-50 transition-colors ${selectedId === s.id ? 'bg-blue-50' : ''}`}>
                  <span className="text-xs text-gray-300 w-5 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`font-medium text-sm ${selectedId === s.id ? 'text-blue-900' : 'text-green-900'} hover:underline`}>
                        {s.abb_name || s.name.split(' ').slice(0, 3).join(' ')}
                      </span>
                      {s.death_year && <span className="text-xs text-gray-400">ت {s.death_year}</span>}
                      {s.grade && <span className={`text-xs ${gradeColor(s.grade)}`}>{s.grade.slice(0, 10)}</span>}
                      {s.is_companion && <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.5 rounded-full">صحابي</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
                        <div className="bg-blue-400 h-1.5 rounded-full"
                          style={{ width: `${(s.unique_teachers / maxTeachers) * 100}%` }} />
                      </div>
                      <span className="text-xs text-blue-700 font-medium">{s.unique_teachers} شيخ</span>
                      {s.companion_teachers > 0 && (
                        <span className="text-xs text-amber-600">({s.companion_teachers} صحابي)</span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400 shrink-0 text-left">
                    {s.total_hadiths.toLocaleString('ar-EG')} حديث
                  </div>
                </a>
              ))}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selected ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-blue-50 px-4 py-2 border-b border-blue-100">
                <h2 className="font-bold text-blue-900 text-sm">{selected.abb_name || selected.name}</h2>
                <div className="flex gap-2 text-xs text-blue-600 mt-0.5 flex-wrap">
                  <span>{selected.unique_teachers} شيخ</span>
                  <span>{selected.companion_teachers} صحابي</span>
                  <span>{selected.total_hadiths.toLocaleString('ar-EG')} حديث</span>
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {teachers.map((t, ti) => (
                  <div key={t.teacher_id} className="px-3 py-2.5 flex items-center gap-2">
                    <span className="text-xs text-gray-300 w-4 shrink-0">{(ti + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1">
                      <Link href={`/narrator/${t.teacher_id}`}
                        className={`text-sm hover:underline font-medium ${t.is_companion ? 'text-amber-800' : 'text-green-900'}`}>
                        {t.teacher_abb || t.teacher_name.split(' ').slice(0, 3).join(' ')}
                      </Link>
                      <div className="flex gap-2 text-xs mt-0.5">
                        {t.is_companion && <span className="text-amber-600 text-xs">صحابي</span>}
                        {t.teacher_death && <span className="text-gray-400">ت {t.teacher_death}</span>}
                        {t.teacher_grade && <span className={`${gradeColor(t.teacher_grade)}`}>{t.teacher_grade.slice(0, 10)}</span>}
                      </div>
                    </div>
                    <span className="text-xs text-blue-600 shrink-0">{t.chain_count} سند</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-gray-50">
                <Link href={`/narrator/${selected.id}`} className="text-xs text-green-700 hover:underline">
                  ← ترجمة {selected.abb_name || selected.name} الكاملة
                </Link>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400">اختر راوياً لعرض قائمة شيوخه</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/tabiin-analysis" className="text-green-700 hover:underline">← تحليل التابعين</Link>
        <Link href="/narrators/sahabi-students" className="text-green-700 hover:underline">← تلاميذ الصحابة</Link>
      </div>
    </div>
  )
}
