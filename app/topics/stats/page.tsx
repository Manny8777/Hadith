import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'إحصاءات الموضوعات — جامع خادم الحرمين' }

interface CategoryStat {
  id: number
  title: string
  left_value: number
  total_hadiths: number
  sahih_count: number
  hasan_count: number
  daif_count: number
  book_count: number
  item_count: number
}

function gradeBar(count: number, total: number, color: string) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return { pct, bar: <div className={`h-full ${color} rounded-full`} style={{ width: `${pct}%` }} /> }
}

export default async function TopicsStatsPage() {
  const { rows } = await pool.query<CategoryStat>(
    `SELECT
       sc.id,
       sc.title,
       sc.left_value,
       COUNT(DISTINCT hs.paragraph_main_id)::int AS total_hadiths,
       COUNT(DISTINCT CASE WHEN hj.grade_class = 'صحيح' THEN hs.paragraph_main_id END)::int AS sahih_count,
       COUNT(DISTINCT CASE WHEN hj.grade_class = 'حسن' THEN hs.paragraph_main_id END)::int AS hasan_count,
       COUNT(DISTINCT CASE WHEN hj.grade_class = 'ضعيف' THEN hs.paragraph_main_id END)::int AS daif_count,
       COUNT(DISTINCT ht.book_id)::int AS book_count,
       COUNT(DISTINCT si.id)::int AS item_count
     FROM subject_categories sc
     LEFT JOIN subject_items si
       ON si.left_value > sc.left_value AND si.right_value < sc.right_value AND si.is_leaf = true
     LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
     LEFT JOIN hadith_toc ht ON ht.main_id = hs.paragraph_main_id
     LEFT JOIN (
       SELECT hadith_id,
         CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
         END AS grade_class
       FROM hadith_judgments
       WHERE say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك|موضوع'
     ) hj ON hj.hadith_id = hs.paragraph_main_id AND hj.grade_class IS NOT NULL
     WHERE sc.parent_id = 1
     GROUP BY sc.id, sc.title, sc.left_value
     ORDER BY sc.left_value`
  ).catch(() => ({ rows: [] }))

  const maxHadiths = rows.length > 0 ? Math.max(...rows.map(r => r.total_hadiths)) : 1

  return (
    <div dir="rtl">
      <div className="mb-6">
        <Link href="/topics" className="text-sm text-green-700 hover:underline">← الفهارس الموضوعية</Link>
        <h1 className="text-2xl font-bold text-green-900 mt-2 mb-1">إحصاءات الموضوعات</h1>
        <p className="text-sm text-gray-500">
          توزيع الأحاديث على كبريات الموضوعات مع تفصيل درجات الأسانيد — مفيد لتقييم الغطاء الحديثي لكل موضوع
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {rows.map(cat => {
          const totalGraded = cat.sahih_count + cat.hasan_count + cat.daif_count
          const widthPct = maxHadiths > 0 ? Math.round((cat.total_hadiths / maxHadiths) * 100) : 0
          const sahihPct = totalGraded > 0 ? Math.round((cat.sahih_count / totalGraded) * 100) : 0
          const hasanPct = totalGraded > 0 ? Math.round((cat.hasan_count / totalGraded) * 100) : 0
          const daifPct = totalGraded > 0 ? Math.round((cat.daif_count / totalGraded) * 100) : 0

          return (
            <div key={cat.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                    <Link
                      href={`/topics/${cat.id}`}
                      className="font-bold text-green-900 hover:text-green-700 text-base hover:underline"
                    >
                      {cat.title}
                    </Link>
                    <div className="flex gap-1.5 text-xs flex-wrap">
                      <span className="text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                        {cat.total_hadiths.toLocaleString('ar-EG')} حديث
                      </span>
                      <span className="text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                        {cat.item_count.toLocaleString('ar-EG')} موضوع فرعي
                      </span>
                      <span className="text-gray-400 bg-gray-50 border border-gray-100 px-2 py-0.5 rounded-full">
                        {cat.book_count} كتاب
                      </span>
                    </div>
                  </div>

                  {/* Total hadiths bar */}
                  <div className="mb-3">
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-1">
                      <div className="h-2 bg-green-600 rounded-full" style={{ width: `${widthPct}%` }} />
                    </div>
                  </div>

                  {/* Grade breakdown */}
                  {totalGraded > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-green-700 font-medium text-left">ص</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${sahihPct}%` }} />
                        </div>
                        <span className="text-gray-500 w-16 text-left tabular-nums">
                          {cat.sahih_count.toLocaleString('ar-EG')} ({sahihPct}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-amber-600 font-medium text-left">ح</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full" style={{ width: `${hasanPct}%` }} />
                        </div>
                        <span className="text-gray-500 w-16 text-left tabular-nums">
                          {cat.hasan_count.toLocaleString('ar-EG')} ({hasanPct}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-red-500 font-medium text-left">ض</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-red-400 rounded-full" style={{ width: `${daifPct}%` }} />
                        </div>
                        <span className="text-gray-500 w-16 text-left tabular-nums">
                          {cat.daif_count.toLocaleString('ar-EG')} ({daifPct}%)
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-700">
        <strong>ملاحظة:</strong> النسب المئوية تحتسب من الأحاديث المحكوم عليها فقط — الأحاديث التي لا يوجد لها حكم مدوَّن مستبعدة من حساب درجات الأسانيد.
      </div>
    </div>
  )
}
