import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface Category {
  id: number
  title: string
  left_value: number
  right_value: number
}

interface GradeRow { grade_class: string; cnt: number }
interface CompanionRow { id: number; name: string; cnt: number }
interface BookRow { book_id: number; book_title: string; cnt: number }
interface DepthRow { chain_length: number; cnt: number }
interface NarratorRow { id: number; name: string; martaba_ibn_hajar: string | null; cnt: number }
interface SubjectItemStat { id: number; title: string; cnt: number }

function gradeColor(g: string) {
  if (g === 'صحيح') return { bar: 'bg-green-500', bg: 'bg-green-100', text: 'text-green-700' }
  if (g === 'حسن')  return { bar: 'bg-amber-400', bg: 'bg-amber-100', text: 'text-amber-700' }
  if (g === 'ضعيف') return { bar: 'bg-red-400',   bg: 'bg-red-100',   text: 'text-red-600'  }
  return { bar: 'bg-gray-300', bg: 'bg-gray-100', text: 'text-gray-600' }
}

function depthColor(d: number): string {
  if (d <= 3) return 'bg-green-500'
  if (d <= 5) return 'bg-amber-400'
  if (d <= 7) return 'bg-orange-400'
  return 'bg-red-400'
}

export default async function TopicAnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const catId = parseInt(id)
  if (isNaN(catId)) notFound()

  const catRes = await pool.query<Category>(
    `SELECT id, title, left_value, right_value FROM subject_categories WHERE id = $1`,
    [catId]
  )
  if (!catRes.rows[0]) notFound()
  const cat = catRes.rows[0]

  const lv = cat.left_value
  const rv = cat.right_value

  const [totalRes, gradeRes, companionRes, bookRes, depthRes, narratorRes, subjectItemsRes] =
    await Promise.all([
      // Total distinct hadiths under this category
      pool.query<{ total: number }>(
        `SELECT COUNT(DISTINCT hs.paragraph_main_id)::int AS total
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         WHERE si.left_value > $1 AND si.right_value < $2`,
        [lv, rv]
      ).catch(() => ({ rows: [{ total: 0 }] })),

      // Grade distribution
      pool.query<GradeRow>(
        `SELECT hj.grade_class, COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         JOIN (
           SELECT hadith_id,
             CASE
               WHEN say_text ~* 'صحيح' THEN 'صحيح'
               WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
               WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             END AS grade_class
           FROM hadith_judgments
           WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
         ) hj ON hj.hadith_id = hs.paragraph_main_id
         WHERE si.left_value > $1 AND si.right_value < $2
           AND hj.grade_class IN ('صحيح', 'حسن', 'ضعيف')
         GROUP BY hj.grade_class
         ORDER BY CASE hj.grade_class WHEN 'صحيح' THEN 1 WHEN 'حسن' THEN 2 WHEN 'ضعيف' THEN 3 END`,
        [lv, rv]
      ).catch(() => ({ rows: [] as GradeRow[] })),

      // Top companion sources
      pool.query<CompanionRow>(
        `SELECT n.id, n.name, COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         JOIN hadith_toc ht ON ht.main_id = hs.paragraph_main_id
         JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
         JOIN isnad_chains ic ON ic.id = ih.isnad_id
         JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true
         WHERE si.left_value > $1 AND si.right_value < $2
           AND ht.is_leaf = true AND ht.is_paragraph = true
         GROUP BY n.id, n.name
         ORDER BY cnt DESC
         LIMIT 15`,
        [lv, rv]
      ).catch(() => ({ rows: [] as CompanionRow[] })),

      // Book distribution
      pool.query<BookRow>(
        `SELECT b.id AS book_id, b.title AS book_title,
                COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         JOIN hadith_toc ht ON ht.main_id = hs.paragraph_main_id
         JOIN books b ON b.id = ht.book_id
         WHERE si.left_value > $1 AND si.right_value < $2
           AND ht.is_leaf = true AND ht.is_paragraph = true
         GROUP BY b.id, b.title
         ORDER BY cnt DESC
         LIMIT 15`,
        [lv, rv]
      ).catch(() => ({ rows: [] as BookRow[] })),

      // Isnad depth distribution
      pool.query<DepthRow>(
        `SELECT ic.chain_length, COUNT(DISTINCT iha.hadith_id)::int AS cnt
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         JOIN isnad_hadiths iha ON iha.hadith_id = hs.paragraph_main_id
         JOIN isnad_chains ic ON ic.id = iha.isnad_id
         WHERE si.left_value > $1 AND si.right_value < $2
           AND ic.chain_length IS NOT NULL AND ic.chain_length > 0
         GROUP BY ic.chain_length
         ORDER BY ic.chain_length`,
        [lv, rv]
      ).catch(() => ({ rows: [] as DepthRow[] })),

      // Most frequent non-companion narrators in chains
      pool.query<NarratorRow>(
        `SELECT n.id, n.name, n.martaba_ibn_hajar,
                COUNT(DISTINCT iha.hadith_id)::int AS cnt
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         JOIN isnad_hadiths iha ON iha.hadith_id = hs.paragraph_main_id
         JOIN isnad_chains ic ON ic.id = iha.isnad_id
         JOIN LATERAL unnest(ic.narrator_id_array) AS nar_id ON true
         JOIN narrators n ON n.id = nar_id AND n.is_companion = false
         WHERE si.left_value > $1 AND si.right_value < $2
         GROUP BY n.id, n.name, n.martaba_ibn_hajar
         ORDER BY cnt DESC
         LIMIT 20`,
        [lv, rv]
      ).catch(() => ({ rows: [] as NarratorRow[] })),

      // Top sub-items by hadith count
      pool.query<SubjectItemStat>(
        `SELECT si.id, si.title, COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
         FROM subject_items si
         LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
         WHERE si.left_value > $1 AND si.right_value < $2
           AND si.is_leaf = true
         GROUP BY si.id, si.title
         ORDER BY cnt DESC
         LIMIT 20`,
        [lv, rv]
      ).catch(() => ({ rows: [] as SubjectItemStat[] })),
    ])

  const total = totalRes.rows[0]?.total || 0
  const gradeRows = gradeRes.rows
  const companions = companionRes.rows
  const books = bookRes.rows
  const depths = depthRes.rows
  const narrators = narratorRes.rows
  const subjectItems = subjectItemsRes.rows

  const gradedTotal = gradeRows.reduce((s, r) => s + r.cnt, 0)
  const maxGrade = Math.max(...gradeRows.map(r => r.cnt), 1)
  const maxComp = Math.max(...companions.map(c => c.cnt), 1)
  const maxBook = Math.max(...books.map(b => b.cnt), 1)
  const maxDepth = Math.max(...depths.map(d => d.cnt), 1)
  const maxNar  = Math.max(...narrators.map(n => n.cnt), 1)

  const sahih  = gradeRows.find(r => r.grade_class === 'صحيح')?.cnt || 0
  const hasan  = gradeRows.find(r => r.grade_class === 'حسن')?.cnt  || 0
  const daif   = gradeRows.find(r => r.grade_class === 'ضعيف')?.cnt  || 0

  function martabaColor(m: string | null) {
    if (!m) return 'text-gray-400'
    if (/ثقة|صدوق/.test(m)) return 'text-green-700'
    if (/ضعيف|منكر/.test(m)) return 'text-red-600'
    return 'text-gray-600'
  }

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/topics" className="text-green-700 hover:underline">الفهارس الموضوعية</Link>
        <span>←</span>
        <Link href={`/topics/${catId}`} className="text-green-700 hover:underline">{cat.title}</Link>
        <span>←</span>
        <span className="text-gray-700">التحليل الإسنادي</span>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تحليل إسناد موضوع: {cat.title}</h1>
        <p className="text-sm text-gray-500">دراسة إحصائية للأحاديث الواردة في هذا الموضوع من حيث الدرجات والأسانيد والمصادر</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-gray-100 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-800">{total.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-gray-500 mt-1">إجمالي الأحاديث</div>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-green-700">{sahih.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-green-600 mt-1">صحيح</div>
        </div>
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-amber-700">{hasan.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-amber-600 mt-1">حسن</div>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-200 p-4 text-center shadow-sm">
          <div className="text-3xl font-bold text-red-600">{daif.toLocaleString('ar-EG')}</div>
          <div className="text-xs text-red-500 mt-1">ضعيف</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Grade distribution */}
        {gradeRows.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-green-900 mb-4">توزيع الدرجات ({gradedTotal.toLocaleString('ar-EG')} حديث محكوم عليه)</h2>
            <div className="space-y-3">
              {gradeRows.map(row => {
                const colors = gradeColor(row.grade_class)
                const pct = Math.round((row.cnt / maxGrade) * 100)
                return (
                  <div key={row.grade_class}>
                    <div className="flex justify-between items-center mb-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                        {row.grade_class}
                      </span>
                      <span className="text-xs text-gray-500">
                        {row.cnt.toLocaleString('ar-EG')} ({gradedTotal > 0 ? Math.round(row.cnt / gradedTotal * 100) : 0}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-3">
                      <div className={`h-full ${colors.bar} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Isnad depth distribution */}
        {depths.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-green-900 mb-4">توزيع طول السند</h2>
            <div className="space-y-2">
              {depths.map(d => (
                <div key={d.chain_length}>
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs text-gray-600">
                      {d.chain_length} رواة
                      {d.chain_length <= 3 && <span className="text-green-600 mr-1">(عالٍ)</span>}
                      {d.chain_length >= 7 && <span className="text-red-500 mr-1">(نازل)</span>}
                    </span>
                    <span className="text-xs text-gray-500">{d.cnt.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className={`h-full rounded-full ${depthColor(d.chain_length)}`}
                      style={{ width: `${Math.round((d.cnt / maxDepth) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              أخضر = إسناد عالٍ (≤3) · أصفر = متوسط (4-5) · برتقالي = نازل (6-7) · أحمر = طويل (8+)
            </p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Top companion sources */}
        {companions.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-green-900 mb-4">أبرز الصحابة رواةً لهذا الموضوع</h2>
            <div className="space-y-2">
              {companions.map(c => (
                <div key={c.id}>
                  <div className="flex items-center justify-between mb-0.5">
                    <Link href={`/narrator/${c.id}`} className="text-xs text-amber-800 hover:underline font-medium truncate max-w-[70%]">
                      {c.name.split('،')[0].trim()}
                    </Link>
                    <span className="text-xs text-gray-500 shrink-0">{c.cnt.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.round((c.cnt / maxComp) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Book distribution */}
        {books.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm">
            <h2 className="text-sm font-bold text-green-900 mb-4">توزيع الأحاديث على الكتب</h2>
            <div className="space-y-2">
              {books.map(b => (
                <div key={b.book_id}>
                  <div className="flex items-center justify-between mb-0.5">
                    <Link href={`/books/${b.book_id}`} className="text-xs text-green-800 hover:underline truncate max-w-[70%]">
                      {b.book_title}
                    </Link>
                    <span className="text-xs text-gray-500 shrink-0">{b.cnt.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.round((b.cnt / maxBook) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Most frequent chain narrators */}
      {narrators.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
          <h2 className="text-sm font-bold text-green-900 mb-4">أكثر الرواة وروداً في أسانيد هذا الموضوع (غير الصحابة)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {narrators.map(n => (
              <Link
                key={n.id}
                href={`/narrator/${n.id}`}
                className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 hover:bg-green-50 transition-colors group"
              >
                <div className="min-w-0">
                  <div className="text-xs font-medium text-gray-800 group-hover:text-green-700 truncate">
                    {n.name.split('،')[0].trim().split(' ').slice(0, 2).join(' ')}
                  </div>
                  {n.martaba_ibn_hajar && (
                    <div className={`text-xs ${martabaColor(n.martaba_ibn_hajar)} truncate`}>{n.martaba_ibn_hajar}</div>
                  )}
                </div>
                <span className="text-xs text-green-700 font-bold shrink-0 mr-1">{n.cnt.toLocaleString('ar-EG')}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-3">
            الرقم = عدد الأحاديث التي يرد فيها الراوي في السند
          </p>
        </div>
      )}

      {/* Top leaf sub-topics */}
      {subjectItems.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm mb-6">
          <h2 className="text-sm font-bold text-green-900 mb-4">أكثر الموضوعات الفرعية أحاديثاً</h2>
          <div className="grid grid-cols-1 gap-2">
            {subjectItems.slice(0, 12).map(si => (
              <div key={si.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-0.5">
                    <Link href={`/topics/item/${si.id}`} className="text-xs text-green-800 hover:underline">
                      {si.title}
                    </Link>
                    <span className="text-xs text-gray-500 shrink-0">{si.cnt.toLocaleString('ar-EG')}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="h-full bg-green-300 rounded-full"
                      style={{ width: `${Math.round((si.cnt / (subjectItems[0]?.cnt || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4 flex-wrap mt-4">
        <Link href={`/topics/${catId}`} className="text-sm text-green-700 hover:underline">
          ← تصفح الموضوعات الفرعية
        </Link>
        <Link href={`/search?subject_cat_id=${catId}`} className="text-sm text-blue-700 hover:underline">
          ← البحث في هذا الموضوع
        </Link>
        <Link href="/topics/companions" className="text-sm text-purple-700 hover:underline">
          ← مصفوفة الصحابة والموضوعات
        </Link>
      </div>
    </div>
  )
}
