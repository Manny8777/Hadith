import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس علل الحديث — جامع خادم الحرمين' }

interface IllahRow {
  illah: string
  cnt: number
  pattern: string
}

interface SampleRow {
  hadith_id: number
  tarf: string | null
  say_text: string
  book_title: string
}

const ILLAH_TYPES = [
  {
    key: 'inqita',
    label: 'الانقطاع',
    arabic: 'منقطع الإسناد',
    description: 'سقط راوٍ أو أكثر من الإسناد ظاهراً',
    pattern: 'منقطع|فيه انقطاع|الإسناد منقطع',
    color: 'bg-red-50 border-red-100',
    badgeColor: 'bg-red-100 text-red-700',
    barColor: 'bg-red-500',
  },
  {
    key: 'irsal',
    label: 'الإرسال',
    arabic: 'مرسل',
    description: 'التابعي يروي مباشرة عن النبي ﷺ بدون صحابي',
    pattern: 'مرسل|إرساله|مرسلاً|إرسال',
    color: 'bg-orange-50 border-orange-100',
    badgeColor: 'bg-orange-100 text-orange-700',
    barColor: 'bg-orange-500',
  },
  {
    key: 'tadlis',
    label: 'التدليس',
    arabic: 'مدلّس',
    description: 'الراوي يُخفي سماعه من شيخ ضعيف',
    pattern: 'مدلس|تدليس|عنعنة|عن عن',
    color: 'bg-amber-50 border-amber-100',
    badgeColor: 'bg-amber-100 text-amber-700',
    barColor: 'bg-amber-500',
  },
  {
    key: 'idtirab',
    label: 'الاضطراب',
    arabic: 'مضطرب',
    description: 'اختلاف في متن الحديث أو إسناده اختلافاً لا يمكن ترجيحه',
    pattern: 'مضطرب|فيه اضطراب|اضطراب',
    color: 'bg-purple-50 border-purple-100',
    badgeColor: 'bg-purple-100 text-purple-700',
    barColor: 'bg-purple-500',
  },
  {
    key: 'shudhudh',
    label: 'الشذوذ',
    arabic: 'شاذ',
    description: 'رواية الثقة مخالفاً لمن هو أثقت منه',
    pattern: 'شاذ|فيه شذوذ|منكر',
    color: 'bg-pink-50 border-pink-100',
    badgeColor: 'bg-pink-100 text-pink-700',
    barColor: 'bg-pink-500',
  },
  {
    key: 'jabr',
    label: 'الوضع والافتراء',
    arabic: 'موضوع',
    description: 'حديث مكذوب أو منسوب للنبي ﷺ زوراً',
    pattern: 'موضوع|مكذوب|كذب|افتراء',
    color: 'bg-gray-50 border-gray-200',
    badgeColor: 'bg-gray-200 text-gray-700',
    barColor: 'bg-gray-500',
  },
  {
    key: 'jahala',
    label: 'الجهالة',
    arabic: 'مجهول الراوي',
    description: 'راوٍ في الإسناد لم يُعرف',
    pattern: 'فيه مجهول|لا يعرف راويه|مجهول',
    color: 'bg-slate-50 border-slate-100',
    badgeColor: 'bg-slate-100 text-slate-700',
    barColor: 'bg-slate-500',
  },
]

export default async function IlalPage({
  searchParams,
}: {
  searchParams: Promise<{ illah?: string }>
}) {
  const sp = await searchParams
  const activeIllah = sp.illah || ''

  const activeType = ILLAH_TYPES.find(t => t.key === activeIllah)

  // Get counts for each illah type
  const countsRes = await Promise.all(
    ILLAH_TYPES.map(t =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT hadith_id)::int AS cnt
         FROM hadith_judgments
         WHERE say_text ~* $1`,
        [t.pattern]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const typesWithCounts = ILLAH_TYPES.map((t, i) => ({
    ...t,
    count: countsRes[i]?.rows[0]?.cnt || 0,
  }))

  const maxCount = Math.max(...typesWithCounts.map(t => t.count), 1)
  const totalIllah = typesWithCounts.reduce((s, t) => s + t.count, 0)

  // Get sample hadiths for active illah
  let samples: SampleRow[] = []
  if (activeType) {
    const samplesRes = await pool.query<SampleRow>(
      `SELECT DISTINCT ON (hj.hadith_id)
              hj.hadith_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              hj.say_text,
              b.title AS book_title
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       WHERE hj.say_text ~* $1
       ORDER BY hj.hadith_id
       LIMIT 20`,
      [activeType.pattern]
    ).catch(() => ({ rows: [] as SampleRow[] }))
    samples = samplesRes.rows
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس علل الحديث</h1>
        <p className="text-sm text-gray-500 mb-3">
          تصنيف الأحاديث بحسب نوع العلة المذكورة في أحكام المحدثين — مدخل لدراسة علوم الحديث التطبيقية
        </p>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
          <span className="font-semibold">تعريف العلة: </span>
          سبب خفيّ يُقدح في صحة الحديث مع أن الإسناد في ظاهره سليم — وهذا أصعب فنون علوم الحديث وأدقها.
          النتائج مستخرجة من نصوص أحكام العلماء في قاعدة البيانات باستخدام مطابقة الألفاظ.
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-green-800 text-white rounded-xl p-3 text-center">
            <div className="text-xl font-bold">{totalIllah.toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-80">حديث فيه علة (بتكرار)</div>
          </div>
          {typesWithCounts.slice(0, 3).map(t => (
            <div key={t.key} className={`rounded-xl border p-3 text-center ${t.color}`}>
              <div className="text-xl font-bold text-gray-800">{t.count.toLocaleString('ar-EG')}</div>
              <div className="text-xs text-gray-600">{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Illah types grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {typesWithCounts.map(t => (
          <Link key={t.key}
            href={`/hadiths/ilal?illah=${t.key}`}
            className={`rounded-xl border p-4 transition-all hover:shadow-md ${t.color} ${
              activeIllah === t.key ? 'ring-2 ring-green-500 shadow-md' : 'hover:border-green-300'
            }`}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="font-bold text-gray-800 text-sm">{t.label}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-bold ${t.badgeColor}`}>
                {t.count.toLocaleString('ar-EG')}
              </span>
            </div>
            <div className="bg-white/60 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full ${t.barColor}`}
                style={{ width: `${(t.count / maxCount) * 100}%` }} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              كلمات البحث: {t.arabic}
            </div>
          </Link>
        ))}
      </div>

      {/* Samples for active illah */}
      {activeType && (
        <div className="mb-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeType.badgeColor}`}>
              {activeType.label}
            </span>
            <span>— نماذج من الأحاديث</span>
          </h2>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-3 text-xs text-amber-800">
            {activeType.description} — البحث عن: &laquo;{activeType.pattern.replace(/\|/g, '، ')}&raquo;
          </div>

          <div className="space-y-3">
            {samples.map(s => (
              <div key={s.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <span className="text-xs text-gray-400">{s.book_title}</span>
                  <Link href={`/hadith/${s.hadith_id}`}
                    className="text-xs text-green-700 hover:underline shrink-0">عرض ←</Link>
                </div>
                <p className="text-sm text-gray-800 leading-relaxed mb-2">
                  {(s.tarf || '').slice(0, 150)}
                  {(s.tarf?.length || 0) > 150 && <span className="text-gray-400">...</span>}
                </p>
                <div className={`rounded-lg px-3 py-1.5 text-xs ${activeType.color} line-clamp-2`}>
                  <span className="font-semibold">الحكم: </span>{s.say_text}
                </div>
              </div>
            ))}
          </div>

          {samples.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-500 text-sm">
              لم يُعثر على نماذج
            </div>
          )}
        </div>
      )}

      {!activeIllah && (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-6 text-center text-gray-500 text-sm">
          اختر نوع العلة من الأعلى لعرض نماذج من الأحاديث
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح</Link>
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
        <Link href="/hadiths/unjudged" className="text-green-700 hover:underline">← غير المحكوم</Link>
      </div>
    </div>
  )
}
