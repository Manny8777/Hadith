import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'مصطلحات الحديث من قاعدة البيانات — جامع خادم الحرمين' }

interface TermResult {
  key: string
  label: string
  arabicDef: string
  count: number
  sampleJudgment: string
  sampleScientist: string
  sampleHadithId: number
}

const TERMS = [
  // Authentication grades
  {
    key: 'sahih_li_dhatihi',
    label: 'صحيح لذاته',
    arabicDef: 'ما رواه عدل ضابط بسند متصل غير معلول ولا شاذ',
    pattern: 'صحيح لذاته',
    category: 'درجات القبول',
    color: 'bg-green-50 border-green-200 text-green-900',
    badgeColor: 'bg-green-600 text-white',
  },
  {
    key: 'sahih_li_ghayrihi',
    label: 'صحيح لغيره',
    arabicDef: 'الحديث الحسن الذي يُعاضد بطرق أخرى فيرتقي إلى الصحة',
    pattern: 'صحيح لغيره',
    category: 'درجات القبول',
    color: 'bg-green-50 border-green-100 text-green-800',
    badgeColor: 'bg-green-500 text-white',
  },
  {
    key: 'hasan_li_dhatihi',
    label: 'حسن لذاته',
    arabicDef: 'ما رواه مقبول خفيف الضبط بسند متصل غير معلول ولا شاذ',
    pattern: 'حسن لذاته',
    category: 'درجات القبول',
    color: 'bg-blue-50 border-blue-200 text-blue-900',
    badgeColor: 'bg-blue-600 text-white',
  },
  {
    key: 'hasan_li_ghayrihi',
    label: 'حسن لغيره',
    arabicDef: 'الحديث الضعيف الذي يُعاضد بطرق أخرى فيرتقي إلى الحسن',
    pattern: 'حسن لغيره',
    category: 'درجات القبول',
    color: 'bg-blue-50 border-blue-100 text-blue-800',
    badgeColor: 'bg-blue-500 text-white',
  },
  {
    key: 'sahih_isnad',
    label: 'إسناده صحيح',
    arabicDef: 'التحقق من صحة الإسناد دون إطلاق حكم على المتن',
    pattern: 'إسناده صحيح',
    category: 'درجات القبول',
    color: 'bg-emerald-50 border-emerald-200 text-emerald-900',
    badgeColor: 'bg-emerald-600 text-white',
  },
  {
    key: 'hasan_isnad',
    label: 'إسناده حسن',
    arabicDef: 'الحكم على الإسناد بالحسن دون إطلاق حكم على المتن',
    pattern: 'إسناده حسن',
    category: 'درجات القبول',
    color: 'bg-teal-50 border-teal-200 text-teal-900',
    badgeColor: 'bg-teal-600 text-white',
  },
  // Weakness grades
  {
    key: 'daif_jiddan',
    label: 'ضعيف جداً',
    arabicDef: 'أشد مراتب الضعف المقبولة قبل الوضع',
    pattern: 'ضعيف جداً|ضعيف جدا',
    category: 'درجات الرد',
    color: 'bg-orange-50 border-orange-200 text-orange-900',
    badgeColor: 'bg-orange-600 text-white',
  },
  {
    key: 'isnaduhu_daif',
    label: 'إسناده ضعيف',
    arabicDef: 'الإسناد به عدم الاتصال أو الضعف في أحد الرواة',
    pattern: 'إسناده ضعيف',
    category: 'درجات الرد',
    color: 'bg-red-50 border-red-200 text-red-900',
    badgeColor: 'bg-red-500 text-white',
  },
  {
    key: 'mawduu',
    label: 'موضوع',
    arabicDef: 'الحديث المختلق المنسوب إلى النبي كذباً وزوراً',
    pattern: 'موضوع|حديث مكذوب|مختلق',
    category: 'درجات الرد',
    color: 'bg-red-100 border-red-300 text-red-900',
    badgeColor: 'bg-red-700 text-white',
  },
  {
    key: 'munkar',
    label: 'منكر',
    arabicDef: 'ما رواه الضعيف مخالفاً الثقات',
    pattern: '^منكر$|حديث منكر|هذا منكر',
    category: 'درجات الرد',
    color: 'bg-amber-50 border-amber-200 text-amber-900',
    badgeColor: 'bg-amber-600 text-white',
  },
  // Structural types
  {
    key: 'mursal',
    label: 'مرسل',
    arabicDef: 'ما سقط منه الصحابي — أن يروي التابعي عن النبي مباشرة',
    pattern: 'مرسل|هذا مرسل',
    category: 'أنواع الأسانيد',
    color: 'bg-purple-50 border-purple-200 text-purple-900',
    badgeColor: 'bg-purple-600 text-white',
  },
  {
    key: 'munqati',
    label: 'منقطع',
    arabicDef: 'ما سقط من إسناده راوٍ أو أكثر غير الصحابي',
    pattern: 'منقطع|هذا منقطع|إسناده منقطع',
    category: 'أنواع الأسانيد',
    color: 'bg-violet-50 border-violet-200 text-violet-900',
    badgeColor: 'bg-violet-600 text-white',
  },
  {
    key: 'mudallis',
    label: 'فيه تدليس',
    arabicDef: 'رواية المدلس بصيغة توهم الاتصال وهو لم يسمع',
    pattern: 'مدلس|تدليس|دلَّس',
    category: 'أنواع الأسانيد',
    color: 'bg-pink-50 border-pink-200 text-pink-900',
    badgeColor: 'bg-pink-600 text-white',
  },
  {
    key: 'mudraj',
    label: 'مدرج',
    arabicDef: 'ما أُدرج في متن الحديث أو سنده ما ليس منه',
    pattern: 'مدرج|إدراج',
    category: 'أنواع الأسانيد',
    color: 'bg-indigo-50 border-indigo-200 text-indigo-900',
    badgeColor: 'bg-indigo-500 text-white',
  },
  {
    key: 'mawquf',
    label: 'موقوف',
    arabicDef: 'ما نُسب إلى الصحابي من قول أو فعل دون رفعه للنبي',
    pattern: 'موقوف|هذا موقوف|الصحيح أنه موقوف',
    category: 'أنواع الأسانيد',
    color: 'bg-slate-50 border-slate-200 text-slate-900',
    badgeColor: 'bg-slate-500 text-white',
  },
  // Special judgments
  {
    key: 'on_standard_both',
    label: 'على شرط الشيخين',
    arabicDef: 'رجاله ممن أخرج لهم البخاري ومسلم في صحيحيهما',
    pattern: 'على شرط(هما|الشيخين)',
    category: 'أحكام خاصة',
    color: 'bg-yellow-50 border-yellow-200 text-yellow-900',
    badgeColor: 'bg-yellow-600 text-white',
  },
  {
    key: 'lam_yukhrij',
    label: 'لم يخرجاه مع الصحة',
    arabicDef: 'على شرطهما لكنهما أعرضا عنه لحكمة',
    pattern: 'على شرط.{0,30}لم يخرج',
    category: 'أحكام خاصة',
    color: 'bg-amber-50 border-amber-100 text-amber-900',
    badgeColor: 'bg-amber-500 text-white',
  },
]

const CATEGORIES = ['درجات القبول', 'درجات الرد', 'أنواع الأسانيد', 'أحكام خاصة']

export default async function HadithTermsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; term?: string }>
}) {
  const sp = await searchParams
  const activeCategory = sp.category || 'درجات القبول'
  const selectedTerm = sp.term || null

  const visibleTerms = TERMS.filter(t => t.category === activeCategory)

  // Get counts for all terms in the category in parallel
  const countsRes = await Promise.all(
    visibleTerms.map(t =>
      pool.query<{ cnt: number; judgment_text: string; scientist_name: string; hadith_id: number }>(
        `SELECT COUNT(DISTINCT hadith_id)::int AS cnt,
                (SELECT hj2.say_text FROM hadith_judgments hj2 WHERE hj2.say_text ~* $1 LIMIT 1) AS judgment_text,
                (SELECT n.name FROM hadith_judgments hj3 JOIN narrators n ON n.id = hj3.scientist_id WHERE hj3.say_text ~* $1 LIMIT 1) AS scientist_name,
                (SELECT hj4.hadith_id FROM hadith_judgments hj4 WHERE hj4.say_text ~* $1 LIMIT 1) AS hadith_id
         FROM hadith_judgments
         WHERE say_text ~* $1`,
        [t.pattern]
      ).catch(() => ({ rows: [{ cnt: 0, judgment_text: '', scientist_name: '', hadith_id: 0 }] }))
    )
  )

  const terms: TermResult[] = visibleTerms.map((t, i) => ({
    key: t.key,
    label: t.label,
    arabicDef: t.arabicDef,
    count: countsRes[i]?.rows[0]?.cnt || 0,
    sampleJudgment: countsRes[i]?.rows[0]?.judgment_text || '',
    sampleScientist: countsRes[i]?.rows[0]?.scientist_name || '',
    sampleHadithId: countsRes[i]?.rows[0]?.hadith_id || 0,
  }))

  // If a specific term is selected, get sample hadiths
  let selectedTermData: typeof TERMS[0] | undefined
  let sampleRows: Array<{ hadith_id: number; book_name: string; hadith_text: string; judgment_text: string; scientist_name: string }> = []

  if (selectedTerm) {
    selectedTermData = TERMS.find(t => t.key === selectedTerm)
    if (selectedTermData) {
      const samplesRes = await pool.query<typeof sampleRows[0]>(
        `SELECT DISTINCT ON (hj.hadith_id)
                hj.hadith_id,
                b.title AS book_name,
                LEFT(ht.tarf, 150) AS hadith_text,
                hj.say_text AS judgment_text,
                n.name AS scientist_name
         FROM hadith_judgments hj
         JOIN narrators n ON n.id = hj.scientist_id
         JOIN hadith_toc ht ON ht.main_id = hj.hadith_id
         JOIN books b ON b.id = ht.book_id
         WHERE hj.say_text ~* $1
         ORDER BY hj.hadith_id
         LIMIT 10`,
        [selectedTermData.pattern]
      ).catch(() => ({ rows: [] }))
      sampleRows = samplesRes.rows
    }
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مصطلحات الحديث في قاعدة البيانات</h1>
        <p className="text-sm text-gray-500 mb-3">
          مصطلحات علوم الحديث المصنَّفة مع الأعداد الحقيقية المستخرجة من أحكام العلماء في قاعدة البيانات —
          اضغط على أي مصطلح لرؤية نماذج من الأحاديث المحكوم عليها به
        </p>

        {/* Category tabs */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          {CATEGORIES.map(cat => (
            <Link key={cat}
              href={`/hadith-terms?category=${encodeURIComponent(cat)}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                activeCategory === cat
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {cat}
            </Link>
          ))}
        </div>

        {/* Terms grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
          {terms.map((t, i) => {
            const term = visibleTerms[i]
            const isSelected = selectedTerm === t.key
            return (
              <Link key={t.key}
                href={`/hadith-terms?category=${encodeURIComponent(activeCategory)}&term=${t.key}`}
                className={`rounded-xl border p-4 hover:shadow-sm transition-all cursor-pointer ${term.color} ${
                  isSelected ? 'ring-2 ring-offset-1 ring-green-500' : ''
                }`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${term.badgeColor}`}>
                        {t.label}
                      </span>
                      {t.count > 0 && (
                        <span className="text-xs text-gray-600 font-bold">
                          {t.count.toLocaleString('ar-EG')} حديث
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 leading-relaxed">{t.arabicDef}</p>
                    {t.sampleScientist && !isSelected && (
                      <p className="text-xs text-gray-400 mt-1 truncate">
                        مثال: {t.sampleScientist}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-300 text-sm shrink-0">←</span>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Selected term samples */}
        {selectedTermData && sampleRows.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-100 p-4">
            <h2 className="font-bold text-green-900 mb-3 text-base flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${visibleTerms.find(t => t.key === selectedTerm)?.badgeColor}`}>
                {selectedTermData.label}
              </span>
              — نماذج من الأحاديث ({sampleRows.length} أمثلة)
            </h2>
            <div className="space-y-3">
              {sampleRows.map(r => (
                <div key={r.hadith_id}
                  className="border border-gray-100 rounded-lg p-3 hover:border-green-200 transition-colors">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400">{r.book_name}</span>
                  </div>
                  <div className="text-sm text-gray-800 mb-1.5 line-clamp-2 leading-relaxed">
                    {r.hadith_text}{r.hadith_text?.length >= 150 ? '...' : ''}
                  </div>
                  <div className="text-xs text-amber-800 bg-amber-50 rounded px-2 py-1 mb-1.5">
                    <span className="font-semibold">{r.scientist_name}: </span>
                    {r.judgment_text}
                  </div>
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-xs text-green-700 hover:underline">
                    الحديث الكامل ←
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link href={`/scholars/judgment-search?q=${encodeURIComponent(selectedTermData.label)}&mode=hadith`}
                className="text-xs text-green-700 hover:underline">
                بحث شامل عن "{selectedTermData.label}" في أحكام العلماء ←
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars/judgment-search" className="text-green-700 hover:underline">← بحث الأحكام</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← علل الحديث</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح والتعديل</Link>
      </div>
    </div>
  )
}
