import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface TSPair {
  teacher_id: number
  teacher_name: string
  teacher_abb: string | null
  teacher_grade: string | null
  teacher_death: string | null
  teacher_companion: boolean
  student_id: number
  student_name: string
  student_abb: string | null
  student_grade: string | null
  student_death: string | null
  chain_count: number
  hadith_count: number
  book_count: number
}

interface PairHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  judgment_text: string | null
}

export default async function TeacherStudentPairsPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string; s?: string; minChains?: string; limit?: string }>
}) {
  const sp = await searchParams
  const teacherId = parseInt(sp.t || '0') || null
  const studentId = parseInt(sp.s || '0') || null
  const minChains = parseInt(sp.minChains || '10')
  const limit = parseInt(sp.limit || '30')

  const [pairsRes, haditshRes] = await Promise.all([
    pool.query<TSPair>(
      `SELECT
         n_teacher.id AS teacher_id,
         n_teacher.name AS teacher_name,
         n_teacher.abb_name AS teacher_abb,
         n_teacher.martaba_ibn_hajar AS teacher_grade,
         n_teacher.death_year_num::text AS teacher_death,
         n_teacher.is_companion AS teacher_companion,
         n_student.id AS student_id,
         n_student.name AS student_name,
         n_student.abb_name AS student_abb,
         n_student.martaba_ibn_hajar AS student_grade,
         n_student.death_year_num::text AS student_death,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.nid AS teacher_nid, t.ord AS teacher_ord
         FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.ord < array_length(ic.narrator_id_array, 1)
         LIMIT 3
       ) teacher_pos
       JOIN narrators n_teacher ON n_teacher.id = teacher_pos.teacher_nid
       JOIN narrators n_student ON n_student.id = ic.narrator_id_array[teacher_pos.teacher_ord + 1]
         AND n_student.id != n_teacher.id
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       WHERE ($1::int IS NULL OR n_teacher.id = $1)
         AND ($2::int IS NULL OR n_student.id = $2)
       GROUP BY n_teacher.id, n_teacher.name, n_teacher.abb_name, n_teacher.martaba_ibn_hajar, n_teacher.death_year_num, n_teacher.is_companion,
                n_student.id, n_student.name, n_student.abb_name, n_student.martaba_ibn_hajar, n_student.death_year_num
       HAVING COUNT(DISTINCT ic.id) >= $3
       ORDER BY COUNT(DISTINCT ic.id) DESC
       LIMIT $4`,
      [teacherId || null, studentId || null, minChains, limit]
    ).catch(() => ({ rows: [] as TSPair[] })),

    (teacherId && studentId) ? pool.query<PairHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text
       FROM isnad_chains ic
       CROSS JOIN LATERAL (
         SELECT t.ord AS teacher_ord
         FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
         WHERE t.nid = $1 LIMIT 1
       ) tpos
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         AND ic.narrator_id_array[tpos.teacher_ord + 1] = $2
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       ORDER BY ht.main_id
       LIMIT 15`,
      [teacherId, studentId]
    ).catch(() => ({ rows: [] as PairHadith[] })) : Promise.resolve({ rows: [] as PairHadith[] }),
  ])

  const pairs = pairsRes.rows
  const hadiths = haditshRes.rows

  const maxChains = Math.max(...pairs.map(p => p.chain_count), 1)

  function gradeColor(g: string | null, isCompanion: boolean) {
    if (isCompanion) return 'text-amber-700'
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  const MIN_CHAINS_OPTIONS = [5, 10, 20, 30]
  const LIMIT_OPTIONS = [20, 30, 50]

  const selectedPair = (teacherId && studentId) ? pairs.find(p => p.teacher_id === teacherId && p.student_id === studentId) : null

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أكثر أزواج الشيخ والراوي تواتراً</h1>
        <p className="text-sm text-gray-500">
          الأزواج الأكثر تكراراً من شيخ وتلميذه المباشر في الأسانيد — يكشف أهم حلقات الرواية وأعمدة نقل الحديث في كل طبقة
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">الحد الأدنى للأسانيد:</span>
        {MIN_CHAINS_OPTIONS.map(m => (
          <a key={m}
            href={`/narrators/teacher-student-pairs?minChains=${m}&limit=${limit}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${minChains === m ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {m}+
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {LIMIT_OPTIONS.map(l => (
          <a key={l}
            href={`/narrators/teacher-student-pairs?minChains=${minChains}&limit=${l}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${limit === l ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </a>
        ))}
        {(teacherId || studentId) && (
          <a href={`/narrators/teacher-student-pairs?minChains=${minChains}&limit=${limit}`}
            className="text-xs text-red-500 hover:underline">× مسح الفلتر</a>
        )}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-indigo-50 px-4 py-2 border-b border-indigo-100 text-xs text-indigo-800 font-medium">
              أكثر ثنائيات الشيخ والتلميذ في الأسانيد
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {pairs.map((p, i) => {
                const barW = Math.round((p.chain_count / maxChains) * 100)
                const isSelected = teacherId === p.teacher_id && studentId === p.student_id
                return (
                  <a key={`${p.teacher_id}-${p.student_id}`}
                    href={`/narrators/teacher-student-pairs?t=${p.teacher_id}&s=${p.student_id}&minChains=${minChains}&limit=${limit}`}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-indigo-50 transition-colors ${isSelected ? 'bg-indigo-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-sm font-semibold ${p.teacher_companion ? 'text-amber-800' : 'text-green-900'}`}>
                          {p.teacher_abb || p.teacher_name.split(' ').slice(0, 3).join(' ')}
                        </span>
                        {p.teacher_companion && <span className="text-xs text-amber-600">صحابي</span>}
                        {p.teacher_grade && !p.teacher_companion && (
                          <span className={`text-xs ${gradeColor(p.teacher_grade, false)}`}>{p.teacher_grade.slice(0, 6)}</span>
                        )}
                        <span className="text-gray-300">→</span>
                        <span className={`text-sm font-semibold text-blue-800`}>
                          {p.student_abb || p.student_name.split(' ').slice(0, 3).join(' ')}
                        </span>
                        {p.student_grade && (
                          <span className={`text-xs ${gradeColor(p.student_grade, false)}`}>{p.student_grade.slice(0, 6)}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-32">
                          <div className="bg-indigo-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-indigo-700 font-medium">{p.chain_count} سند</span>
                        <span className="text-xs text-gray-400">{p.hadith_count} حديث</span>
                        <span className="text-xs text-gray-400">{p.book_count} كتاب</span>
                      </div>
                    </div>
                  </a>
                )
              })}
              {pairs.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">لا توجد بيانات بهذه الفلاتر</div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selectedPair && hadiths.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-indigo-50 px-4 py-3 border-b border-indigo-100">
                <div className="text-xs text-indigo-800 font-semibold mb-1">
                  {selectedPair.teacher_abb || selectedPair.teacher_name.split(' ').slice(0, 2).join(' ')}
                  <span className="text-indigo-400 mx-1">←</span>
                  {selectedPair.student_abb || selectedPair.student_name.split(' ').slice(0, 2).join(' ')}
                </div>
                <div className="flex gap-3 text-xs text-indigo-600">
                  <span>{selectedPair.chain_count} سند</span>
                  <span>{selectedPair.hadith_count} حديث</span>
                  <span>{selectedPair.book_count} كتاب</span>
                </div>
                <div className="flex gap-2 mt-2">
                  <Link href={`/narrator/${selectedPair.teacher_id}`} className="text-xs text-green-700 hover:underline">
                    ← ترجمة الشيخ
                  </Link>
                  <Link href={`/narrator/${selectedPair.student_id}`} className="text-xs text-blue-600 hover:underline">
                    ← ترجمة التلميذ
                  </Link>
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-[50vh] overflow-y-auto">
                {hadiths.map(h => (
                  <div key={h.hadith_id} className="px-3 py-3">
                    <div className="flex items-center gap-2 mb-1 text-xs">
                      <span className="text-gray-500">{h.book_name}</span>
                      {h.judgment_text && (
                        <span className={`${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 15)}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-800 leading-relaxed mb-1">{h.hadith_text}...</p>
                    <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">←</Link>
                  </div>
                ))}
              </div>
            </div>
          ) : teacherId && studentId ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-sm text-gray-400">
              لا توجد أحاديث لهذا الزوج بالفلاتر الحالية
            </div>
          ) : (
            <div className="bg-indigo-50 rounded-xl border border-indigo-100 p-6 text-center">
              <div className="text-sm text-indigo-700">اضغط على أي زوج لعرض أحاديثهم المشتركة</div>
              <p className="text-xs text-indigo-500 mt-2 leading-relaxed">
                كل زوج يمثل حلقة رواية متكررة — كثرة الأسانيد المشتركة تدل على قوة التلمذة وعمق العلاقة العلمية
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/prolific-students" className="text-green-700 hover:underline">← المكثرون من الشيوخ</Link>
        <Link href="/narrators/sahabi-students" className="text-green-700 hover:underline">← تلاميذ الصحابة</Link>
        <Link href="/narrators/generation-bridge" className="text-green-700 hover:underline">← جسور الأجيال</Link>
      </div>
    </div>
  )
}
