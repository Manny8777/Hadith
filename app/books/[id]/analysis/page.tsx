import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface BookInfo {
  id: number; title: string; takhrij_author: string | null; takhrij_death: number | null
  total_hadiths: number; fame: number | null
}
interface CompanionRow { companion_id: number; name: string; hadith_count: number }
interface DepthRow { chain_length: number; chain_count: number; hadith_count: number }
interface NarratorFreqRow { narrator_id: number; name: string; abb_name: string | null; martaba_ibn_hajar: string | null; appearances: number }
interface GradeRow { grade_class: string; cnt: number }

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-50 text-gray-600'
  if (/ثقة|ثبت|حجة/.test(grade)) return 'bg-green-50 text-green-700'
  if (/صدوق|مقبول|لا بأس/.test(grade)) return 'bg-amber-50 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-50 text-red-600'
  return 'bg-gray-50 text-gray-600'
}

function chainDepthLabel(n: number): string {
  const map: Record<number, string> = { 3: 'ثلاثي', 4: 'رباعي', 5: 'خماسي', 6: 'سداسي', 7: 'سباعي', 8: 'ثماني', 9: 'تساعي' }
  return map[n] || `${n} رجال`
}

export default async function BookAnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bookId = parseInt(id)
  if (isNaN(bookId)) notFound()

  const [bookRes, companionsRes, depthRes, narratorFreqRes, gradeRes] = await Promise.all([
    pool.query<BookInfo>(
      `SELECT b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame,
              COUNT(h.main_id)::int AS total_hadiths
       FROM books b
       LEFT JOIN hadith_toc h ON h.book_id = b.id AND h.is_leaf = true AND h.is_paragraph = true
       WHERE b.id = $1
       GROUP BY b.id, b.title, b.takhrij_author, b.takhrij_death, b.fame`,
      [bookId]
    ),
    // Top companion sources via narrator_id_array[1]
    pool.query<CompanionRow>(
      `SELECT
         ic.narrator_id_array[1] AS companion_id,
         n.name,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN narrators n ON n.id = ic.narrator_id_array[1]
       WHERE ht.book_id = $1 AND ic.narrator_id_array[1] IS NOT NULL
       GROUP BY ic.narrator_id_array[1], n.name
       ORDER BY hadith_count DESC
       LIMIT 20`,
      [bookId]
    ).catch(() => ({ rows: [] })),
    // Isnad depth distribution
    pool.query<DepthRow>(
      `SELECT
         ic.chain_length,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE ht.book_id = $1 AND ic.chain_length IS NOT NULL
       GROUP BY ic.chain_length
       ORDER BY ic.chain_length`,
      [bookId]
    ).catch(() => ({ rows: [] })),
    // Most frequent narrators in chains (excluding companions = position 1)
    pool.query<NarratorFreqRow>(
      `WITH chain_members AS (
         SELECT DISTINCT ih.hadith_id, unnest(ic.narrator_id_array[2:]) AS narrator_id
         FROM hadith_toc ht
         JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         WHERE ht.book_id = $1
       )
       SELECT cm.narrator_id, n.name, n.abb_name, n.martaba_ibn_hajar,
              COUNT(DISTINCT cm.hadith_id)::int AS appearances
       FROM chain_members cm
       JOIN narrators n ON n.id = cm.narrator_id
       WHERE NOT n.is_companion
       GROUP BY cm.narrator_id, n.name, n.abb_name, n.martaba_ibn_hajar
       ORDER BY appearances DESC
       LIMIT 30`,
      [bookId]
    ).catch(() => ({ rows: [] })),
    // Grade distribution
    pool.query<GradeRow>(
      `SELECT grade_class, COUNT(DISTINCT hadith_id)::int AS cnt
       FROM (
         SELECT j.hadith_id,
           CASE
             WHEN j.say_text ~* 'صحيح' THEN 'صحيح'
             WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND j.say_text !~* 'صحيح' THEN 'حسن'
             WHEN j.say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           END AS grade_class
         FROM hadith_judgments j
         JOIN hadith_toc ht ON ht.main_id = j.hadith_id
         WHERE ht.book_id = $1
           AND j.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
       ) sub
       WHERE grade_class IS NOT NULL
       GROUP BY grade_class`,
      [bookId]
    ).catch(() => ({ rows: [] })),
  ])

  if (!bookRes.rows[0]) notFound()
  const book = bookRes.rows[0]
  const companions = companionsRes.rows
  const depths = depthRes.rows
  const narrators = narratorFreqRes.rows
  const grades = gradeRes.rows

  const totalCompanionHadiths = companions.reduce((s, c) => s + c.hadith_count, 0)
  const maxDepthCount = depths.length > 0 ? Math.max(...depths.map(d => d.hadith_count)) : 1
  const maxNarCount = narrators.length > 0 ? Math.max(...narrators.map(n => n.appearances)) : 1

  const sahih = grades.find(g => g.grade_class === 'صحيح')?.cnt || 0
  const hasan = grades.find(g => g.grade_class === 'حسن')?.cnt || 0
  const daif = grades.find(g => g.grade_class === 'ضعيف')?.cnt || 0
  const totalGraded = sahih + hasan + daif

  return (
    <div dir="rtl">
      <div className="mb-4">
        <Link href={`/books/${bookId}`} className="text-sm text-green-700 hover:underline">← {book.title}</Link>
        <h1 className="text-xl font-bold text-green-900 mt-2">تحليل {book.title}</h1>
        {book.takhrij_author && (
          <p className="text-sm text-gray-500 mt-0.5">
            {book.takhrij_author}{book.takhrij_death ? ` (ت. ${book.takhrij_death} هـ)` : ''}
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center">
          <div className="text-2xl font-bold text-green-700">{book.total_hadiths.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي الأحاديث</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-100 p-4 text-center">
          <div className="text-2xl font-bold text-green-600">{sahih.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-500 mt-1">صحيح ({totalGraded > 0 ? Math.round(sahih/totalGraded*100) : 0}%)</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-100 p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">{hasan.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-500 mt-1">حسن ({totalGraded > 0 ? Math.round(hasan/totalGraded*100) : 0}%)</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-4 text-center">
          <div className="text-2xl font-bold text-red-500">{daif.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-500 mt-1">ضعيف ({totalGraded > 0 ? Math.round(daif/totalGraded*100) : 0}%)</div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Companion sources */}
        {companions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-green-900 mb-4 text-base">مصادر الأحاديث بالصحابة</h2>
            <div className="space-y-2">
              {companions.map((c, i) => {
                const pct = totalCompanionHadiths > 0 ? Math.round((c.hadith_count / totalCompanionHadiths) * 100) : 0
                return (
                  <div key={c.companion_id} className="flex items-center gap-3">
                    <span className="text-xs text-gray-400 w-5 text-center shrink-0">{(i + 1)}</span>
                    <Link href={`/narrator/${c.companion_id}`} className="text-sm text-green-800 hover:underline min-w-0 shrink-0 max-w-36 truncate">
                      {c.name}
                    </Link>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className="h-2 bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums shrink-0 w-16 text-left">
                      {c.hadith_count.toLocaleString('ar-EG')} ({pct}%)
                    </span>
                  </div>
                )
              })}
            </div>
            {companions.length >= 20 && (
              <p className="text-xs text-gray-400 mt-3">أعلى 20 صحابياً</p>
            )}
          </div>
        )}

        {/* Isnad depth distribution */}
        {depths.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h2 className="font-bold text-green-900 mb-4 text-base">توزيع أطوال الأسانيد</h2>
            <div className="space-y-3">
              {depths.map(d => {
                const pct = maxDepthCount > 0 ? Math.round((d.hadith_count / maxDepthCount) * 100) : 0
                return (
                  <div key={d.chain_length} className="flex items-center gap-3">
                    <div className="flex flex-col w-20 shrink-0">
                      <span className="text-sm font-semibold text-green-800">{chainDepthLabel(d.chain_length)}</span>
                      <span className="text-xs text-gray-400">{d.chain_length} رجال</span>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-3 rounded-full ${
                          d.chain_length <= 4 ? 'bg-green-500' :
                          d.chain_length <= 6 ? 'bg-amber-400' :
                          'bg-orange-400'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500 tabular-nums shrink-0 w-24 text-left">
                      {d.hadith_count.toLocaleString('ar-EG')} ح
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-3 text-xs text-gray-400 bg-gray-50 rounded-lg p-2">
              الأسانيد القصيرة (ثلاثي، رباعي) = علو الإسناد — أقل وسائط تعني أقرب إلى المصدر
            </div>
          </div>
        )}
      </div>

      {/* Most frequent narrators in chains */}
      {narrators.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 mb-6">
          <h2 className="font-bold text-green-900 mb-1 text-base">أكثر الرواة حضوراً في أسانيد الكتاب</h2>
          <p className="text-xs text-gray-400 mb-4">الرواة غير الصحابة المذكورون في أسانيد الكتاب (باستثناء أصحاب المرتبة الأولى)</p>
          <div className="grid sm:grid-cols-2 gap-2">
            {narrators.map((n, i) => {
              const pct = maxNarCount > 0 ? Math.round((n.appearances / maxNarCount) * 100) : 0
              return (
                <div key={n.narrator_id} className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 w-5 text-center shrink-0">{i + 1}</span>
                  <Link
                    href={`/narrator/${n.narrator_id}`}
                    className={`text-xs px-2 py-1 rounded border shrink-0 hover:shadow-sm transition-all max-w-32 truncate ${gradeColor(n.martaba_ibn_hajar)}`}
                  >
                    {n.abb_name || n.name}
                  </Link>
                  <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div className="h-2 bg-blue-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-gray-400 tabular-nums shrink-0 w-10 text-left">
                    {n.appearances.toLocaleString('ar-EG')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/books/${bookId}`}
          className="px-4 py-2 text-sm bg-green-700 text-white rounded-xl hover:bg-green-800 transition-colors">
          تصفح الكتاب
        </Link>
        <Link href={`/books/${bookId}/narrators`}
          className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-green-300 transition-colors">
          رواة الكتاب
        </Link>
        <Link href={`/books/intersection?a=${bookId}`}
          className="px-4 py-2 text-sm bg-white border border-gray-200 text-gray-700 rounded-xl hover:border-green-300 transition-colors">
          تقاطع مع كتاب آخر
        </Link>
      </div>
    </div>
  )
}
