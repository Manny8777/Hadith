import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'إحصاءات قاعدة البيانات — جامع خادم الحرمين' }

interface BookDistRow {
  book_id: number
  book_title: string
  total_hadiths: number
  sahih_count: number
  hasan_count: number
  daif_count: number
}

interface GradeRow {
  grade: string
  cnt: number
}

interface NarratorCenturyRow {
  century: string
  cnt: number
  thiqa_cnt: number
}

interface TopNarratorRow {
  id: number
  name: string
  abb_name: string | null
  hadiths_count: number
  martaba_ibn_hajar: string | null
  is_companion: boolean
}

function gradeColor(grade: string): string {
  if (/صحيح لذاته/.test(grade)) return 'bg-green-600'
  if (/صحيح لغيره/.test(grade)) return 'bg-green-500'
  if (/صحيح/.test(grade)) return 'bg-green-400'
  if (/حسن لذاته/.test(grade)) return 'bg-blue-500'
  if (/حسن لغيره/.test(grade)) return 'bg-blue-400'
  if (/حسن/.test(grade)) return 'bg-blue-300'
  if (/ضعيف جداً|ضعيف جدا/.test(grade)) return 'bg-red-600'
  if (/ضعيف/.test(grade)) return 'bg-red-400'
  if (/موضوع/.test(grade)) return 'bg-red-800'
  return 'bg-gray-400'
}

function narratorBadgeCls(grade: string | null, isCompanion: boolean): string {
  if (isCompanion) return 'bg-amber-100 text-amber-800'
  if (!grade) return 'bg-gray-100 text-gray-600'
  if (/ثقة|ثبت|حجة|حافظ/.test(grade)) return 'bg-green-100 text-green-800'
  if (/صدوق|لا بأس|مقبول/.test(grade)) return 'bg-blue-100 text-blue-800'
  if (/ضعيف|متروك|منكر|كذاب/.test(grade)) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-600'
}

export default async function StatsPage() {
  const [
    totalsRes,
    gradeDistRes,
    bookDistRes,
    centuryRes,
    topNarratorsRes,
    isnadTypeRes,
  ] = await Promise.all([

    // Core totals
    pool.query<{ label: string; val: number }>(
      `SELECT 'hadiths'    AS label, COUNT(*)::int AS val
         FROM hadith_toc WHERE is_leaf = true AND is_paragraph = true
       UNION ALL
       SELECT 'books',     COUNT(*)::int FROM books WHERE tarteeb > 0
       UNION ALL
       SELECT 'narrators', COUNT(*)::int FROM narrators
       UNION ALL
       SELECT 'judgments', COUNT(*)::int FROM hadith_judgments
       UNION ALL
       SELECT 'takhrij',   COUNT(DISTINCT group_id)::int FROM takhrij
       UNION ALL
       SELECT 'isnads',    COUNT(*)::int FROM isnad_hadiths`
    ).catch(() => ({ rows: [] })),

    // Grade distribution from say_text
    pool.query<GradeRow>(
      `SELECT
         CASE
           WHEN say_text ~* 'صحيح لذاته'        THEN 'صحيح لذاته'
           WHEN say_text ~* 'صحيح لغيره'        THEN 'صحيح لغيره'
           WHEN say_text ~* 'صحيح'              THEN 'صحيح'
           WHEN say_text ~* 'حسن لذاته'         THEN 'حسن لذاته'
           WHEN say_text ~* 'حسن لغيره'         THEN 'حسن لغيره'
           WHEN say_text ~* 'حسن'               THEN 'حسن'
           WHEN say_text ~* 'ضعيف جداً|ضعيف جدا' THEN 'ضعيف جداً'
           WHEN say_text ~* 'ضعيف'              THEN 'ضعيف'
           WHEN say_text ~* 'موضوع|مكذوب|مختلق' THEN 'موضوع'
           ELSE 'أخرى'
         END AS grade,
         COUNT(DISTINCT hadith_id)::int AS cnt
       FROM hadith_judgments
       GROUP BY grade
       ORDER BY cnt DESC`
    ).catch(() => ({ rows: [] })),

    // Hadith count per book, top 20
    pool.query<BookDistRow>(
      `SELECT
         b.id AS book_id,
         b.title AS book_title,
         COUNT(DISTINCT ht.main_id)::int AS total_hadiths,
         COUNT(DISTINCT CASE WHEN j.grade_class = 'صحيح' THEN ht.main_id END)::int AS sahih_count,
         COUNT(DISTINCT CASE WHEN j.grade_class = 'حسن'  THEN ht.main_id END)::int AS hasan_count,
         COUNT(DISTINCT CASE WHEN j.grade_class = 'ضعيف' THEN ht.main_id END)::int AS daif_count
       FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
                          AND ht.is_leaf = true AND ht.is_paragraph = true
       LEFT JOIN (
         SELECT hadith_id,
           CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن'
               AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL
           END AS grade_class
         FROM hadith_judgments
       ) j ON j.hadith_id = ht.main_id
       WHERE b.tarteeb > 0
       GROUP BY b.id, b.title
       ORDER BY total_hadiths DESC
       LIMIT 20`
    ).catch(() => ({ rows: [] })),

    // Narrators by death century
    pool.query<NarratorCenturyRow>(
      `SELECT
         CASE
           WHEN death_year_num BETWEEN 1   AND 100 THEN 'القرن الأول'
           WHEN death_year_num BETWEEN 101 AND 200 THEN 'القرن الثاني'
           WHEN death_year_num BETWEEN 201 AND 300 THEN 'القرن الثالث'
           WHEN death_year_num BETWEEN 301 AND 400 THEN 'القرن الرابع'
           WHEN death_year_num BETWEEN 401 AND 500 THEN 'القرن الخامس'
           WHEN death_year_num > 500              THEN 'بعد القرن الخامس'
           ELSE 'غير معروف'
         END AS century,
         COUNT(*)::int AS cnt,
         SUM(CASE WHEN martaba_ibn_hajar ~* 'ثقة|ثبت|حجة|حافظ' THEN 1 ELSE 0 END)::int AS thiqa_cnt
       FROM narrators
       GROUP BY century
       ORDER BY MIN(death_year_num) ASC NULLS LAST`
    ).catch(() => ({ rows: [] })),

    // Top narrators by hadith count
    pool.query<TopNarratorRow>(
      `SELECT id, name, abb_name, hadiths_count, martaba_ibn_hajar, is_companion
       FROM narrators
       WHERE hadiths_count > 0
       ORDER BY hadiths_count DESC
       LIMIT 15`
    ).catch(() => ({ rows: [] })),

    // Isnad type distribution
    pool.query<{ isnad_type: number; cnt: number }>(
      `SELECT isnad_type, COUNT(DISTINCT hadith_id)::int AS cnt
       FROM isnad_hadiths
       WHERE isnad_type IS NOT NULL
       GROUP BY isnad_type
       ORDER BY isnad_type`
    ).catch(() => ({ rows: [] })),
  ])

  const totals = Object.fromEntries(totalsRes.rows.map(r => [r.label, r.val]))
  const gradeData = gradeDistRes.rows.filter(r => r.grade !== 'أخرى')
  const maxGradeCount = Math.max(...gradeData.map(r => r.cnt), 1)
  const totalJudged = gradeData.reduce((s, r) => s + r.cnt, 0)

  const bookDist = bookDistRes.rows
  const maxBookCount = Math.max(...bookDist.map(r => r.total_hadiths), 1)

  const centuries = centuryRes.rows
  const maxCentury = Math.max(...centuries.map(r => r.cnt), 1)

  const topNarrators = topNarratorsRes.rows
  const maxNarCount = Math.max(...topNarrators.map(r => r.hadiths_count), 1)

  const isnadTypeMap: Record<number, string> = { 1: 'مرفوع', 2: 'موقوف', 3: 'مقطوع', 4: 'مرسل' }
  const isnadTypeColors: Record<number, string> = {
    1: 'bg-green-500',
    2: 'bg-amber-500',
    3: 'bg-orange-500',
    4: 'bg-blue-500',
  }
  const maxIsnadCnt = Math.max(...isnadTypeRes.rows.map(r => r.cnt), 1)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">إحصاءات قاعدة البيانات</h1>
        <p className="text-sm text-gray-500">
          نظرة شاملة على محتوى الموسوعة — من الأحاديث والرواة إلى الأحكام والأسانيد
        </p>
      </div>

      {/* Core stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
        {[
          { key: 'hadiths',   label: 'حديث',          sub: 'ورقة + فقرة',        color: 'bg-green-50 border-green-100',   numColor: 'text-green-800',   href: '/search' },
          { key: 'books',     label: 'كتاب',           sub: 'في المجموعة',        color: 'bg-amber-50 border-amber-100',   numColor: 'text-amber-800',   href: '/books' },
          { key: 'narrators', label: 'راوٍ',           sub: 'في قاعدة البيانات', color: 'bg-blue-50 border-blue-100',     numColor: 'text-blue-800',    href: '/narrators' },
          { key: 'judgments', label: 'حكم مسجَّل',    sub: 'من المحدثين',        color: 'bg-purple-50 border-purple-100', numColor: 'text-purple-800',  href: '/scholars' },
          { key: 'isnads',    label: 'إسناد',          sub: 'في قاعدة الأسانيد', color: 'bg-indigo-50 border-indigo-100', numColor: 'text-indigo-800',  href: '/hadiths/chain-lengths' },
          { key: 'takhrij',   label: 'مجموعة تخريج',  sub: 'أحاديث متحدة المتن', color: 'bg-teal-50 border-teal-100',    numColor: 'text-teal-800',    href: '/hadiths/in-all-six' },
        ].map(s => (
          <Link key={s.key} href={s.href}
            className={`rounded-xl border p-4 text-center hover:shadow-sm transition-all ${s.color}`}>
            <div className={`text-2xl font-bold ${s.numColor}`}>
              {(totals[s.key] || 0).toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-gray-600 mt-0.5 font-medium">{s.label}</div>
            <div className="text-xs text-gray-400">{s.sub}</div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">

        {/* Grade distribution */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 mb-3 text-sm flex items-center gap-2">
            توزيع درجات الأحاديث
            <span className="text-xs text-gray-400 font-normal">
              ({totalJudged.toLocaleString('ar-EG')} مُحكوم عليه)
            </span>
          </h2>
          <div className="space-y-2">
            {gradeData.slice(0, 9).map(r => (
              <div key={r.grade} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-24 shrink-0 truncate">{r.grade}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className={`h-2 rounded-full ${gradeColor(r.grade)}`}
                    style={{ width: `${(r.cnt / maxGradeCount) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-14 shrink-0 text-left">
                  {r.cnt.toLocaleString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
          <Link href="/hadiths/grade-dispute" className="text-xs text-green-700 hover:underline mt-2 block">
            الخلاف في الدرجة ←
          </Link>
        </div>

        {/* Isnad type distribution */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 mb-3 text-sm">توزيع أنواع الأسانيد</h2>
          <div className="space-y-3">
            {isnadTypeRes.rows.map(r => (
              <div key={r.isnad_type} className="flex items-center gap-2">
                <span className="text-xs text-gray-700 w-16 shrink-0 font-medium">
                  {isnadTypeMap[r.isnad_type] || `نوع ${r.isnad_type}`}
                </span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full ${isnadTypeColors[r.isnad_type] || 'bg-gray-400'}`}
                    style={{ width: `${(r.cnt / maxIsnadCnt) * 100}%` }} />
                </div>
                <span className="text-xs text-gray-500 w-16 shrink-0 text-left">
                  {r.cnt.toLocaleString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
          <Link href="/hadiths/mawquf" className="text-xs text-amber-700 hover:underline mt-3 block">
            الموقوف والمرسل ←
          </Link>
        </div>

        {/* Narrators by century */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 mb-3 text-sm">توزيع الرواة بالقرون الهجرية</h2>
          <div className="space-y-2">
            {centuries.map(r => (
              <div key={r.century} className="flex items-center gap-2">
                <span className="text-xs text-gray-600 w-28 shrink-0">{r.century}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div className="h-3 rounded-full flex"
                    style={{ width: `${(r.cnt / maxCentury) * 100}%` }}>
                    <div className="h-full bg-green-400"
                      style={{ width: `${(r.thiqa_cnt / Math.max(r.cnt, 1)) * 100}%` }} />
                    <div className="h-full bg-gray-300 flex-1" />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-14 text-left shrink-0">
                  {r.cnt.toLocaleString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-green-400 rounded inline-block" /> ثقات
            </span>
            <span className="flex items-center gap-1">
              <span className="w-3 h-2 bg-gray-300 rounded inline-block" /> غيرهم
            </span>
          </div>
          <Link href="/narrators/generations" className="text-xs text-green-700 hover:underline mt-2 block">
            طبقات الرواة ←
          </Link>
        </div>

        {/* Top narrators */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h2 className="font-bold text-green-900 mb-3 text-sm">أكثر الرواة أحاديث</h2>
          <div className="space-y-1.5">
            {topNarrators.map((n, i) => (
              <div key={n.id} className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-5 text-center shrink-0">
                  {(i + 1).toLocaleString('ar-EG')}
                </span>
                {n.is_companion && (
                  <span className="text-xs bg-amber-500 text-white font-bold px-1 py-0.5 rounded shrink-0">ص</span>
                )}
                <Link href={`/narrator/${n.id}`}
                  className="text-xs text-gray-700 hover:text-green-700 flex-1 truncate font-medium">
                  {n.abb_name || n.name}
                </Link>
                {n.martaba_ibn_hajar && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${narratorBadgeCls(n.martaba_ibn_hajar, n.is_companion)}`}>
                    {n.martaba_ibn_hajar.slice(0, 8)}
                  </span>
                )}
                <div className="w-16 bg-gray-100 rounded-full h-2 shrink-0">
                  <div className="h-2 rounded-full bg-green-500"
                    style={{ width: `${(n.hadiths_count / maxNarCount) * 100}%` }} />
                </div>
                <span className="text-xs text-green-700 font-bold w-12 text-left shrink-0">
                  {n.hadiths_count.toLocaleString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
          <Link href="/narrators/stats" className="text-xs text-green-700 hover:underline mt-2 block">
            إحصاءات الرواة ←
          </Link>
        </div>
      </div>

      {/* Books by hadith count */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
        <h2 className="font-bold text-green-900 mb-3 text-sm">
          توزيع الأحاديث حسب الكتاب
          <span className="text-xs text-gray-400 font-normal mr-2">(أعلى 20 كتاباً)</span>
        </h2>
        <div className="space-y-2">
          {bookDist.map(r => (
            <div key={r.book_id} className="flex items-center gap-2">
              <Link href={`/books/${r.book_id}`}
                className="text-xs text-gray-700 hover:text-green-700 hover:underline w-40 shrink-0 truncate">
                {r.book_title}
              </Link>
              <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                <div className="h-full flex rounded-full overflow-hidden"
                  style={{ width: `${(r.total_hadiths / maxBookCount) * 100}%` }}>
                  {r.sahih_count > 0 && (
                    <div className="h-full bg-green-500"
                      style={{ width: `${(r.sahih_count / r.total_hadiths) * 100}%` }} />
                  )}
                  {r.hasan_count > 0 && (
                    <div className="h-full bg-blue-400"
                      style={{ width: `${(r.hasan_count / r.total_hadiths) * 100}%` }} />
                  )}
                  {r.daif_count > 0 && (
                    <div className="h-full bg-red-400"
                      style={{ width: `${(r.daif_count / r.total_hadiths) * 100}%` }} />
                  )}
                  <div className="h-full bg-gray-300 flex-1" />
                </div>
              </div>
              <span className="text-xs text-gray-500 w-14 shrink-0 text-left">
                {r.total_hadiths.toLocaleString('ar-EG')}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-green-500 rounded inline-block" /> صحيح</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-400 rounded inline-block" /> حسن</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-red-400 rounded inline-block" /> ضعيف</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 bg-gray-300 rounded inline-block" /> غير محكوم</span>
        </div>
        <Link href="/books/authenticity" className="text-xs text-green-700 hover:underline mt-2 block">
          جودة الأسانيد بالكتب ←
        </Link>
      </div>

      {/* Quick navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
        {[
          { href: '/narrators/stats',    label: 'إحصاءات الرواة',          color: 'bg-green-50' },
          { href: '/books/stats',        label: 'إحصاءات الكتب',           color: 'bg-amber-50' },
          { href: '/scholars/activity',  label: 'نشاط العلماء',            color: 'bg-purple-50' },
          { href: '/hadiths/unjudged',   label: 'الأحاديث غير المحكومة',   color: 'bg-gray-50' },
        ].map(l => (
          <Link key={l.href} href={l.href}
            className={`${l.color} border border-gray-100 rounded-xl p-3 text-center hover:shadow-sm transition-all`}>
            <div className="text-xs font-medium text-gray-700">{l.label}</div>
          </Link>
        ))}
      </div>
    </div>
  )
}
