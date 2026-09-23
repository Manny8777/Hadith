import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return { title: `إحصاءات الراوي — جامع خادم الحرمين` }
}

function gradeClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-100 text-green-700'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'bg-amber-100 text-amber-700'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function NarratorStatisticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const narratorId = parseInt(id)
  if (isNaN(narratorId)) notFound()

  const [
    narratorRes,
    booksRes,
    positionsRes,
    subjectsRes,
    teachersRes,
    studentsRes,
  ] = await Promise.all([
    pool.query(
      `SELECT id, name, abb_name, death_year_num, tabaqa, martaba_ibn_hajar, hadiths_count
       FROM narrators WHERE id = $1`,
      [narratorId]
    ),

    pool.query<{ book_id: number; title: string; hadith_count: number }>(
      `SELECT b.id AS book_id, b.title, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       WHERE $1 = ANY(ic.narrator_id_array)
       GROUP BY b.id, b.title
       ORDER BY hadith_count DESC
       LIMIT 20`,
      [narratorId]
    ).catch(() => ({ rows: [] as { book_id: number; title: string; hadith_count: number }[] })),

    pool.query<{ position: number; cnt: number }>(
      `SELECT pos.ord::int AS position, COUNT(*)::int AS cnt
       FROM isnad_chains ic
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       WHERE pos.nar_id = $1
       GROUP BY pos.ord
       ORDER BY pos.ord
       LIMIT 15`,
      [narratorId]
    ).catch(() => ({ rows: [] as { position: number; cnt: number }[] })),

    pool.query<{ subject: string; hadith_count: number }>(
      `SELECT si.title AS subject, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_subjects hs ON hs.paragraph_main_id = ih.hadith_id
       JOIN subject_items si ON si.id = hs.subject_id
       WHERE $1 = ANY(ic.narrator_id_array)
       GROUP BY si.id, si.title
       ORDER BY hadith_count DESC
       LIMIT 15`,
      [narratorId]
    ).catch(() => ({ rows: [] as { subject: string; hadith_count: number }[] })),

    pool.query<{ id: number; name: string; abb_name: string | null; appearances: number; martaba_ibn_hajar: string | null }>(
      `SELECT n_t.id, n_t.name, n_t.abb_name, COUNT(*)::int AS appearances, n_t.martaba_ibn_hajar
       FROM isnad_chains ic
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n_t ON n_t.id = ic.narrator_id_array[pos.ord - 1]
       WHERE pos.nar_id = $1 AND pos.ord > 1
       GROUP BY n_t.id, n_t.name, n_t.abb_name, n_t.martaba_ibn_hajar
       ORDER BY appearances DESC
       LIMIT 10`,
      [narratorId]
    ).catch(() => ({ rows: [] as { id: number; name: string; abb_name: string | null; appearances: number; martaba_ibn_hajar: string | null }[] })),

    pool.query<{ id: number; name: string; abb_name: string | null; appearances: number; martaba_ibn_hajar: string | null }>(
      `SELECT n_s.id, n_s.name, n_s.abb_name, COUNT(*)::int AS appearances, n_s.martaba_ibn_hajar
       FROM isnad_chains ic
       JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
       JOIN narrators n_s ON n_s.id = ic.narrator_id_array[pos.ord + 1]
       WHERE pos.nar_id = $1
         AND pos.ord < array_length(ic.narrator_id_array, 1)
       GROUP BY n_s.id, n_s.name, n_s.abb_name, n_s.martaba_ibn_hajar
       ORDER BY appearances DESC
       LIMIT 10`,
      [narratorId]
    ).catch(() => ({ rows: [] as { id: number; name: string; abb_name: string | null; appearances: number; martaba_ibn_hajar: string | null }[] })),
  ])

  if (!narratorRes.rows[0]) notFound()

  const narrator = narratorRes.rows[0]
  const books = booksRes.rows
  const positions = positionsRes.rows
  const subjects = subjectsRes.rows
  const teachers = teachersRes.rows
  const students = studentsRes.rows

  const maxBookCount = books[0]?.hadith_count || 1
  const maxPosCount = Math.max(...positions.map(p => p.cnt), 1)
  const maxSubCount = subjects[0]?.hadith_count || 1

  const positionLabels: Record<number, string> = {
    1: 'مبدأ الإسناد (الصحابي/الأول)',
    2: 'الثاني في السند',
    3: 'الثالث في السند',
    4: 'الرابع في السند',
    5: 'الخامس في السند',
  }

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/narrators" className="hover:text-green-700">الرواة</Link>
        <span>›</span>
        <Link href={`/narrator/${narratorId}`} className="hover:text-green-700">
          {narrator.abb_name || narrator.name}
        </Link>
        <span>›</span>
        <span className="text-gray-700">إحصاءات</span>
      </div>

      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-green-900 mb-1">{narrator.name}</h1>
          <div className="flex items-center gap-2 flex-wrap">
            {narrator.martaba_ibn_hajar && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeClass(narrator.martaba_ibn_hajar)}`}>
                {narrator.martaba_ibn_hajar}
              </span>
            )}
            {narrator.tabaqa && (
              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {narrator.tabaqa}
              </span>
            )}
            {narrator.death_year_num && (
              <span className="text-xs text-gray-500">ت {narrator.death_year_num}</span>
            )}
            {narrator.hadiths_count > 0 && (
              <span className="text-xs text-gray-400">{narrator.hadiths_count.toLocaleString('ar-EG')} حديث إجمالاً</span>
            )}
          </div>
        </div>
        <Link href={`/narrator/${narratorId}`}
          className="text-sm text-green-700 border border-green-200 bg-green-50 px-3 py-1.5 rounded-lg hover:bg-green-100 transition-colors shrink-0">
          ← صفحة الراوي
        </Link>
      </div>

      <div className="grid gap-5">

        {/* Book Distribution */}
        {books.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-5">
            <h2 className="text-base font-bold text-green-900 mb-4">توزيع الأحاديث على الكتب</h2>
            <div className="space-y-2">
              {books.map(b => (
                <div key={b.book_id} className="flex items-center gap-2">
                  <Link href={`/books/${b.book_id}?narrator=${narratorId}`}
                    className="text-sm text-green-800 hover:underline w-40 shrink-0 truncate text-right">
                    {b.title}
                  </Link>
                  <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="bg-green-700 h-3 rounded-full transition-all"
                      style={{ width: `${(b.hadith_count / maxBookCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-14 text-left shrink-0">
                    {b.hadith_count.toLocaleString('ar-EG')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

          {/* Chain Positions */}
          {positions.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-base font-bold text-green-900 mb-1">مواضع الراوي في الأسانيد</h2>
              <p className="text-xs text-gray-400 mb-4">كم مرة يظهر في كل موضع من مواضع السند</p>
              <div className="space-y-3">
                {positions.map(p => (
                  <div key={p.position}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-600">
                        {positionLabels[p.position] || `الموضع ${p.position}`}
                      </span>
                      <span className="text-xs font-medium text-green-800">
                        {p.cnt.toLocaleString('ar-EG')}
                      </span>
                    </div>
                    <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-amber-500 h-2 rounded-full"
                        style={{ width: `${(p.cnt / maxPosCount) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                الموضع ١ = طرف الإسناد (الصحابي عادةً) — الموضع الأخير = راوي الكتاب
              </p>
            </div>
          )}

          {/* Top Subjects */}
          {subjects.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-base font-bold text-green-900 mb-1">الموضوعات الأكثر ورود</h2>
              <p className="text-xs text-gray-400 mb-4">الأبواب الفقهية والموضوعية التي يكثر فيها هذا الراوي</p>
              <div className="space-y-2">
                {subjects.map(s => (
                  <div key={s.subject} className="flex items-center gap-2">
                    <span className="text-xs text-gray-700 text-right flex-1 truncate">{s.subject}</span>
                    <div className="w-20 bg-gray-100 rounded-full h-2 overflow-hidden shrink-0">
                      <div
                        className="bg-indigo-500 h-2 rounded-full"
                        style={{ width: `${(s.hadith_count / maxSubCount) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 w-8 text-left shrink-0">
                      {s.hadith_count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Teachers & Students side by side */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {teachers.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-base font-bold text-green-900 mb-1">أكثر من روى عنه</h2>
              <p className="text-xs text-gray-400 mb-3">المشايخ الأكثر ظهوراً في الأسانيد قبله مباشرة</p>
              <div className="space-y-2">
                {teachers.map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-2">
                    <Link href={`/narrator/${t.id}`}
                      className="text-sm text-green-800 hover:underline truncate flex-1">
                      {t.abb_name || t.name}
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      {t.martaba_ibn_hajar && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeClass(t.martaba_ibn_hajar)}`}>
                          {t.martaba_ibn_hajar.slice(0, 6)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{t.appearances}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {students.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-5">
              <h2 className="text-base font-bold text-green-900 mb-1">أكثر من روى عنه</h2>
              <p className="text-xs text-gray-400 mb-3">التلاميذ الأكثر ظهوراً في الأسانيد بعده مباشرة</p>
              <div className="space-y-2">
                {students.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2">
                    <Link href={`/narrator/${s.id}`}
                      className="text-sm text-green-800 hover:underline truncate flex-1">
                      {s.abb_name || s.name}
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      {s.martaba_ibn_hajar && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeClass(s.martaba_ibn_hajar)}`}>
                          {s.martaba_ibn_hajar.slice(0, 6)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{s.appearances}×</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Summary note */}
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
          <span className="font-semibold">ملاحظة: </span>
          العدد المُعروض هو عدد أحاديث لا أسانيد — حديث واحد قد يرد في أسانيد متعددة كلها تمر بهذا الراوي.
          مواضع الإسناد تُعدّ من أهم المعايير لتحديد طبيعة دور الراوي: هل هو مصدر رئيسي (أول السند)
          أم حلقة وسيطة أم ناقل في الطبقة المتأخرة.
        </div>
      </div>
    </div>
  )
}
