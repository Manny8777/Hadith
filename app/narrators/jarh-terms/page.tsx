import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مصطلحات الجرح والتعديل — جامع خادم الحرمين' }

interface GradeRow {
  martaba_ibn_hajar: string
  narrator_count: number
  sample_names: string | null
}

interface CriticismLabel {
  garh_label: string
  entry_count: number
  narrator_count: number
}

// Group similar terms into tiers
function gradeTier(grade: string): { tier: number; label: string; color: string } {
  const g = grade.toLowerCase()
  if (/ثقة.*ثبت|ثبت.*حجة|إمام.*حافظ/.test(g) || /ثقة ثقة/.test(g)) {
    return { tier: 1, label: 'التوثيق الأعلى', color: 'bg-green-100 text-green-900 border-green-300' }
  }
  if (/^ثقة$|^ثقة،|ثقة فاضل|ثقة عابد|ثقة حافظ/.test(g)) {
    return { tier: 2, label: 'ثقة', color: 'bg-green-50 text-green-800 border-green-200' }
  }
  if (/صدوق|لا بأس.*إسناده|مقبول|لا بأس به/.test(g)) {
    return { tier: 3, label: 'صدوق', color: 'bg-amber-50 text-amber-800 border-amber-200' }
  }
  if (/صدوق.*يهم|صدوق.*تغير|مقبول(?! ثقة)/.test(g)) {
    return { tier: 4, label: 'صدوق مع ملاحظة', color: 'bg-amber-100 text-amber-900 border-amber-300' }
  }
  if (/ضعيف(?! جداً)/.test(g) || /فيه.*لين|لين الحديث|سيئ الحفظ/.test(g)) {
    return { tier: 5, label: 'ضعيف', color: 'bg-red-50 text-red-800 border-red-200' }
  }
  if (/ضعيف جداً|متروك|منكر الحديث|واهٍ/.test(g)) {
    return { tier: 6, label: 'ضعيف جداً أو متروك', color: 'bg-red-100 text-red-900 border-red-300' }
  }
  if (/كذاب|وضاع|متهم|موضوع/.test(g)) {
    return { tier: 7, label: 'مكذَّب أو وضَّاع', color: 'bg-gray-800 text-white border-gray-900' }
  }
  if (/مجهول|لم أعرفه/.test(g)) {
    return { tier: 8, label: 'مجهول', color: 'bg-gray-100 text-gray-700 border-gray-300' }
  }
  if (/صحابي|له صحبة/.test(g)) {
    return { tier: 0, label: 'صحابي', color: 'bg-amber-200 text-amber-900 border-amber-400' }
  }
  return { tier: 9, label: 'أخرى', color: 'bg-white text-gray-600 border-gray-200' }
}

export default async function JarhTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>
}) {
  const sp = await searchParams
  const view = sp.view || 'ibn_hajar'

  const [gradesRes, criticismRes] = await Promise.all([
    pool.query<GradeRow>(
      `SELECT
         martaba_ibn_hajar,
         COUNT(*)::int AS narrator_count,
         STRING_AGG(COALESCE(abb_name, name), '، ' ORDER BY hadiths_count DESC NULLS LAST) FILTER (WHERE rn <= 3) AS sample_names
       FROM (
         SELECT martaba_ibn_hajar, abb_name, name, hadiths_count,
                ROW_NUMBER() OVER (PARTITION BY martaba_ibn_hajar ORDER BY hadiths_count DESC NULLS LAST) AS rn
         FROM narrators
         WHERE martaba_ibn_hajar IS NOT NULL AND martaba_ibn_hajar != ''
       ) sub
       GROUP BY martaba_ibn_hajar
       ORDER BY narrator_count DESC`
    ).catch(() => ({ rows: [] as GradeRow[] })),

    pool.query<CriticismLabel>(
      `SELECT
         garh_label,
         COUNT(*)::int AS entry_count,
         COUNT(DISTINCT narrator_id)::int AS narrator_count
       FROM narrator_criticism
       WHERE garh_label IS NOT NULL AND garh_label != ''
       GROUP BY garh_label
       ORDER BY entry_count DESC
       LIMIT 50`
    ).catch(() => ({ rows: [] as CriticismLabel[] })),
  ])

  const grades = gradesRes.rows
  const criticismLabels = criticismRes.rows

  // Group grades by tier
  type TierGroup = { tier: number; label: string; color: string; items: GradeRow[] }
  const tierMap = new Map<number, TierGroup>()
  for (const g of grades) {
    const t = gradeTier(g.martaba_ibn_hajar)
    if (!tierMap.has(t.tier)) {
      tierMap.set(t.tier, { tier: t.tier, label: t.label, color: t.color, items: [] })
    }
    tierMap.get(t.tier)!.items.push(g)
  }
  const tiers = Array.from(tierMap.values()).sort((a, b) => a.tier - b.tier)

  const totalNarrators = grades.reduce((sum, g) => sum + g.narrator_count, 0)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مصطلحات الجرح والتعديل</h1>
        <p className="text-sm text-gray-500 mb-3">
          توزيع رواة قاعدة البيانات وفق ألفاظ الجرح والتعديل لدى ابن حجر في "تقريب التهذيب" وغيره —
          يُظهر الكثافة الفعلية لكل مصطلح في التراث الرجالي
        </p>
        <div className="flex items-center gap-3 mb-4">
          <Link href="/narrators/jarh-terms?view=ibn_hajar"
            className={`text-xs px-3 py-1.5 rounded-lg border ${view === 'ibn_hajar' ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            درجات ابن حجر (martaba_ibn_hajar)
          </Link>
          <Link href="/narrators/jarh-terms?view=garh_labels"
            className={`text-xs px-3 py-1.5 rounded-lg border ${view === 'garh_labels' ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            تصنيفات الجرح (garh_label)
          </Link>
        </div>
      </div>

      {view === 'ibn_hajar' ? (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs text-blue-800">
            <span className="font-semibold">مجموع الرواة بدرجة: </span>
            {totalNarrators.toLocaleString('ar-EG')} راوٍ في {grades.length.toLocaleString('ar-EG')} درجة مختلفة.
            النسب أدناه من إجمالي الرواة الذين لهم درجة محددة.
          </div>

          {tiers.map(tier => (
            <div key={tier.tier}>
              <div className={`text-xs font-bold px-3 py-1.5 rounded-lg border mb-2 inline-block ${tier.color}`}>
                {tier.label} — {tier.items.reduce((s, i) => s + i.narrator_count, 0).toLocaleString('ar-EG')} راوٍ
              </div>
              <div className="grid grid-cols-1 gap-2">
                {tier.items.map(g => {
                  const pct = Math.round((g.narrator_count / totalNarrators) * 100 * 10) / 10
                  return (
                    <Link
                      key={g.martaba_ibn_hajar}
                      href={`/narrators?q=${encodeURIComponent(g.martaba_ibn_hajar)}&grade_exact=1`}
                      className="bg-white rounded-xl border border-gray-100 px-4 py-3 hover:shadow-sm hover:border-green-200 transition-all group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-green-900 group-hover:underline">
                            {g.martaba_ibn_hajar}
                          </div>
                          {g.sample_names && (
                            <div className="text-xs text-gray-400 mt-0.5 truncate">
                              مثل: {g.sample_names}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-left">
                          <div className="text-sm font-bold text-green-800">
                            {g.narrator_count.toLocaleString('ar-EG')}
                          </div>
                          <div className="text-xs text-gray-400">{pct}%</div>
                        </div>
                        <div className="w-20 shrink-0">
                          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full ${
                                tier.tier <= 2 ? 'bg-green-500' :
                                tier.tier <= 4 ? 'bg-amber-400' :
                                tier.tier <= 6 ? 'bg-red-400' :
                                'bg-gray-400'
                              }`}
                              style={{ width: `${Math.min(100, pct * 5)}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="text-xs text-gray-500 mb-4">
            تصنيفات مستخلصة من أقوال العلماء في كتب الجرح والتعديل —
            تمثل ألفاظ الحكم الفعلية المسجلة في قاعدة البيانات
          </p>
          <div className="grid grid-cols-1 gap-2">
            {criticismLabels.map(cl => (
              <div key={cl.garh_label}
                className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-3">
                <div className="flex-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    gradeTier(cl.garh_label).color
                  }`}>
                    {cl.garh_label}
                  </span>
                </div>
                <div className="text-left shrink-0">
                  <div className="text-sm font-bold text-green-800">
                    {cl.entry_count.toLocaleString('ar-EG')} قول
                  </div>
                  <div className="text-xs text-gray-400">
                    {cl.narrator_count.toLocaleString('ar-EG')} راوٍ
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Research reference */}
      <div className="mt-8 bg-amber-50 border border-amber-100 rounded-xl p-4 text-xs text-amber-800">
        <p className="font-semibold mb-2">دليل مصطلحات الجرح والتعديل (مختصر)</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {[
            { term: 'ثقة', meaning: 'عدل ضابط — أعلى مراتب التوثيق' },
            { term: 'ثقة ثقة', meaning: 'فوق الثقة — التوثيق الأعلى عند ابن معين' },
            { term: 'صدوق', meaning: 'عدل، قد يهم — حديثه حسن' },
            { term: 'صدوق يهم', meaning: 'يخطئ أحياناً — قد ينزل حديثه' },
            { term: 'مقبول', meaning: 'لا يُعرف إلا من رواية واحد' },
            { term: 'ضعيف', meaning: 'سيئ الضبط — حديثه لا يحتج به' },
            { term: 'متروك', meaning: 'ترك حديثه — قريب من الكذب' },
            { term: 'كذاب', meaning: 'وضع الحديث أو اتُّهم به' },
            { term: 'مجهول', meaning: 'لا تُعرف حاله أو ذاته' },
          ].map(t => (
            <div key={t.term} className="bg-white rounded-lg p-2 border border-amber-50">
              <div className="font-bold text-amber-900">{t.term}</div>
              <div className="text-gray-600 mt-0.5">{t.meaning}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-amber-600">
          المرجع: "تقريب التهذيب" لابن حجر العسقلاني — المراتب التسع ومصطلحاتها
        </p>
      </div>

      <div className="mt-4 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← تصفح الرواة</Link>
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/narrators/generations" className="text-green-700 hover:underline">← الطبقات</Link>
      </div>
    </div>
  )
}
