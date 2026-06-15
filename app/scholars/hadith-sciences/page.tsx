import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'أقوال أهل العلم في علوم الحديث — جامع خادم الحرمين',
  description: 'ألفاظ الجرح والتعديل، والعلماء الناقدون، وإحصاءات منظومة علم الرجال',
}

interface GradingTerm {
  term_text: string
  sort_order: number | null
  is_taqreeb: boolean
}

interface TopScholar {
  scientist_name: string
  eval_count: number
}

interface Stats {
  total_terms: number
  total_pairs: number
  taqreeb_count: number
  jarh_count: number
}

export default async function HadithSciencesPage() {
  const [termsRes, scholarsRes, statsRes] = await Promise.all([
    pool.query<GradingTerm>(
      `SELECT term_text, sort_order, is_taqreeb
       FROM narrator_grading_terms
       ORDER BY sort_order NULLS LAST, term_text
       LIMIT 200`
    ).catch(() => ({ rows: [] as GradingTerm[] })),

    pool.query<TopScholar>(
      `SELECT scientist_name, COUNT(*)::int AS eval_count
       FROM narrator_scientists
       WHERE scientist_name IS NOT NULL AND scientist_name != ''
       GROUP BY scientist_name
       ORDER BY eval_count DESC
       LIMIT 30`
    ).catch(() => ({ rows: [] as TopScholar[] })),

    pool.query<Stats>(
      `SELECT
         COUNT(*)::int AS total_terms,
         SUM(CASE WHEN is_taqreeb = true THEN 1 ELSE 0 END)::int AS taqreeb_count,
         SUM(CASE WHEN is_taqreeb = false THEN 1 ELSE 0 END)::int AS jarh_count,
         (SELECT COUNT(*)::int FROM narrator_scientists) AS total_pairs
       FROM narrator_grading_terms`
    ).catch(() => ({ rows: [{ total_terms: 0, total_pairs: 0, taqreeb_count: 0, jarh_count: 0 }] as Stats[] })),
  ])

  const allTerms = termsRes.rows
  const taqreebTerms = allTerms.filter(t => t.is_taqreeb === true)
  const jarhTerms = allTerms.filter(t => t.is_taqreeb === false)
  const scholars = scholarsRes.rows
  const stats = statsRes.rows[0] ?? { total_terms: 0, total_pairs: 0, taqreeb_count: 0, jarh_count: 0 }

  const maxEvalCount = scholars[0]?.eval_count ?? 1

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-amber-200 hover:text-white text-sm transition-colors">
            ← الرئيسية
          </Link>
          <h1 className="text-lg font-bold text-amber-100 text-center">
            أقوال أهل العلم في علوم الحديث
          </h1>
          <Link href="/scholars" className="text-amber-200 hover:text-white text-sm transition-colors">
            العلماء
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 space-y-10">

        {/* Page intro */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-xl font-bold text-green-900 mb-2">علم الجرح والتعديل</h2>
          <p className="text-sm text-gray-600 leading-relaxed mb-4">
            علم الجرح والتعديل من أشرف العلوم الإسلامية، يُعنى بدراسة أحوال رواة الحديث توثيقاً وتضعيفاً.
            أفرد له العلماء مصنفات خاصة، وابتكروا ألفاظاً دقيقة للدلالة على درجات الرواة في الضبط والعدالة،
            حتى صارت هذه الألفاظ منظومة اصطلاحية متكاملة تُميّز بين المراتب تمييزاً دقيقاً.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/narrators/jarh-terms"
              className="text-xs px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-800 hover:bg-green-100 transition-colors">
              درجات الرواة
            </Link>
            <Link href="/scholars/activity"
              className="text-xs px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 transition-colors">
              نشاط الناقدين
            </Link>
            <Link href="/scholars/judgment-search"
              className="text-xs px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 hover:bg-blue-100 transition-colors">
              البحث في الأحكام
            </Link>
          </div>
        </div>

        {/* Section 3 — Statistics (shown first as summary) */}
        <section>
          <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-green-700 rounded-full inline-block" />
            إحصاءات الجرح والتعديل
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              {
                num: Number(stats.total_terms).toLocaleString('ar-EG'),
                label: 'ألفاظ الجرح والتعديل',
                sub: 'في قاعدة المصطلحات',
                color: 'border-green-200 bg-green-50',
                numColor: 'text-green-900',
              },
              {
                num: Number(stats.taqreeb_count).toLocaleString('ar-EG'),
                label: 'ألفاظ التعديل',
                sub: 'توثيق وتزكية',
                color: 'border-amber-200 bg-amber-50',
                numColor: 'text-amber-800',
              },
              {
                num: Number(stats.jarh_count).toLocaleString('ar-EG'),
                label: 'ألفاظ الجرح',
                sub: 'تضعيف وطعن',
                color: 'border-rose-200 bg-rose-50',
                numColor: 'text-rose-800',
              },
              {
                num: Number(stats.total_pairs).toLocaleString('ar-EG'),
                label: 'تقييم للرواة',
                sub: 'بين عالم وراوٍ',
                color: 'border-indigo-200 bg-indigo-50',
                numColor: 'text-indigo-900',
              },
            ].map((card, i) => (
              <div key={i} className={`rounded-2xl border p-5 ${card.color}`}>
                <div className={`text-2xl font-bold tabular-nums ${card.numColor}`}>{card.num}</div>
                <div className="text-sm font-semibold text-gray-700 mt-1">{card.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{card.sub}</div>
              </div>
            ))}
          </div>

          {/* Distribution bar */}
          {(Number(stats.taqreeb_count) + Number(stats.jarh_count)) > 0 && (
            <div className="mt-4 bg-white rounded-xl border border-gray-100 p-4">
              <p className="text-xs text-gray-500 mb-2">توزيع الألفاظ بين التعديل والجرح</p>
              <div className="flex rounded-full overflow-hidden h-4 gap-0.5">
                {(() => {
                  const total = Number(stats.taqreeb_count) + Number(stats.jarh_count)
                  const tPct = total > 0 ? Math.round((Number(stats.taqreeb_count) / total) * 100) : 0
                  const jPct = 100 - tPct
                  return (
                    <>
                      <div
                        className="bg-amber-400 h-4 flex items-center justify-center text-xs text-amber-900 font-semibold transition-all"
                        style={{ width: `${tPct}%` }}
                      >
                        {tPct > 10 ? `تعديل ${tPct}%` : ''}
                      </div>
                      <div
                        className="bg-rose-400 h-4 flex items-center justify-center text-xs text-white font-semibold transition-all"
                        style={{ width: `${jPct}%` }}
                      >
                        {jPct > 10 ? `جرح ${jPct}%` : ''}
                      </div>
                    </>
                  )
                })()}
              </div>
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>ألفاظ التعديل ← الأرفع قدراً في المنظومة الاصطلاحية</span>
                <span>→ ألفاظ الجرح</span>
              </div>
            </div>
          )}
        </section>

        {/* Section 1 — Grading Terms */}
        <section>
          <h2 className="text-lg font-bold text-green-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-amber-500 rounded-full inline-block" />
            ألفاظ الجرح والتعديل
          </h2>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            الألفاظ الاصطلاحية التي استخدمها أئمة النقد لتقييم الرواة — مرتبة من أعلى درجات التوثيق إلى أشد ألفاظ الجرح.
            صنّف العلماء هذه الألفاظ في مراتب دقيقة؛ فمنها ما يدل على الرفعة والإتقان، ومنها ما ينبئ بالضعف والترك.
          </p>

          <div className="grid md:grid-cols-2 gap-6">

            {/* تعديل terms */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-amber-800 bg-amber-100 border border-amber-200 px-3 py-1 rounded-full">
                  ألفاظ التعديل
                </span>
                <span className="text-xs text-gray-400">
                  ({taqreebTerms.length.toLocaleString('ar-EG')} لفظ)
                </span>
              </div>

              {taqreebTerms.length === 0 ? (
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 text-center text-amber-600 text-sm">
                  لا توجد ألفاظ تعديل مسجّلة
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pl-1">
                  {taqreebTerms.map((term, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 hover:border-amber-300 hover:bg-amber-100 transition-all group"
                    >
                      {term.sort_order !== null && (
                        <span className="text-xs text-amber-400 tabular-nums shrink-0 w-6 text-left">
                          {String(term.sort_order)}
                        </span>
                      )}
                      <span className="text-sm font-medium text-amber-900 flex-1 leading-relaxed">
                        {term.term_text}
                      </span>
                      <span className="text-xs text-amber-500 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        تعديل
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* جرح terms */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-bold text-rose-800 bg-rose-100 border border-rose-200 px-3 py-1 rounded-full">
                  ألفاظ الجرح
                </span>
                <span className="text-xs text-gray-400">
                  ({jarhTerms.length.toLocaleString('ar-EG')} لفظ)
                </span>
              </div>

              {jarhTerms.length === 0 ? (
                <div className="bg-rose-50 border border-rose-100 rounded-xl p-6 text-center text-rose-600 text-sm">
                  لا توجد ألفاظ جرح مسجّلة
                </div>
              ) : (
                <div className="space-y-1.5 max-h-96 overflow-y-auto pl-1">
                  {jarhTerms.map((term, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 bg-rose-50 border border-rose-100 rounded-lg px-4 py-2.5 hover:border-rose-300 hover:bg-rose-100 transition-all group"
                    >
                      {term.sort_order !== null && (
                        <span className="text-xs text-rose-300 tabular-nums shrink-0 w-6 text-left">
                          {String(term.sort_order)}
                        </span>
                      )}
                      <span className="text-sm font-medium text-rose-900 flex-1 leading-relaxed">
                        {term.term_text}
                      </span>
                      <span className="text-xs text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        جرح
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Methodology note */}
          <div className="mt-5 bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
            <p className="font-semibold mb-1">ملاحظة منهجية</p>
            <p className="leading-relaxed">
              اختلف العلماء في تحديد عدد مراتب الجرح والتعديل؛ فجعلها بعضهم أربعاً، وبعضهم ستاً أو أكثر.
              وقد أبدع ابن أبي حاتم في ضبطها واستقرأها من كلام الأئمة المتقدمين. وتختلف دلالة اللفظ أحياناً
              بحسب قائله؛ فـ"لا بأس به" عند ابن معين توثيق، وعند غيره تليين.
            </p>
          </div>
        </section>

        {/* Section 2 — Top Scholars by evaluation count */}
        <section>
          <h2 className="text-lg font-bold text-green-900 mb-1 flex items-center gap-2">
            <span className="w-1 h-6 bg-indigo-500 rounded-full inline-block" />
            العلماء الناقدون
          </h2>
          <p className="text-sm text-gray-500 mb-5 leading-relaxed">
            أكثر علماء الجرح والتعديل تقييماً للرواة في قاعدة البيانات — مرتبون بعدد تقييماتهم المسجّلة.
            كلما ازداد عدد التقييمات دلّ ذلك على سعة اطّلاع العالم وكثرة تصانيفه الرجالية.
          </p>

          {scholars.length === 0 ? (
            <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
              لا توجد بيانات للعلماء
            </div>
          ) : (
            <div className="space-y-2">
              {scholars.map((scholar, idx) => {
                const barPct = Math.round((scholar.eval_count / maxEvalCount) * 100)
                const rank = idx + 1
                let rankBadge = ''
                let rankColor = 'text-gray-400'
                if (rank === 1) { rankBadge = '🥇'; rankColor = 'text-yellow-600' }
                else if (rank === 2) { rankBadge = '🥈'; rankColor = 'text-gray-500' }
                else if (rank === 3) { rankBadge = '🥉'; rankColor = 'text-amber-700' }

                return (
                  <div
                    key={scholar.scientist_name}
                    className="bg-white rounded-xl border border-gray-100 px-5 py-3.5 hover:border-green-200 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`text-sm tabular-nums font-bold shrink-0 w-7 ${rankColor}`}>
                        {rankBadge || rank.toLocaleString('ar-EG')}
                      </span>
                      <span className="flex-1 font-bold text-green-900 text-sm">
                        {scholar.scientist_name}
                      </span>
                      <span className="shrink-0 text-sm font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-0.5 rounded-full">
                        {scholar.eval_count.toLocaleString('ar-EG')} تقييم
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-indigo-400 h-1.5 rounded-full transition-all"
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 shrink-0 w-10 text-left tabular-nums">
                        {barPct}%
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Reference: Classic texts on hadith sciences */}
        <section>
          <h2 className="text-lg font-bold text-green-900 mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-gray-400 rounded-full inline-block" />
            أمهات كتب علوم الحديث في الجرح والتعديل
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {[
              {
                title: 'الجرح والتعديل',
                author: 'ابن أبي حاتم الرازي',
                death: '327 هـ',
                note: 'أشمل كتب الجرح والتعديل المسندة — تسعة مجلدات',
                color: 'bg-green-50 border-green-200',
                titleColor: 'text-green-900',
              },
              {
                title: 'الضعفاء الكبير',
                author: 'العقيلي',
                death: '322 هـ',
                note: 'يجمع أقوال النقاد في الرواة المتكلَّم فيهم',
                color: 'bg-amber-50 border-amber-200',
                titleColor: 'text-amber-900',
              },
              {
                title: 'تهذيب الكمال',
                author: 'المزي',
                death: '742 هـ',
                note: 'موسوعة رجالية جامعة للتوثيق والتجريح',
                color: 'bg-blue-50 border-blue-200',
                titleColor: 'text-blue-900',
              },
              {
                title: 'تقريب التهذيب',
                author: 'ابن حجر العسقلاني',
                death: '852 هـ',
                note: 'مختصر محرر يضبط درجة كل راوٍ في جملة وجيزة',
                color: 'bg-purple-50 border-purple-200',
                titleColor: 'text-purple-900',
              },
              {
                title: 'الكاشف',
                author: 'الذهبي',
                death: '748 هـ',
                note: 'تهذيب وانتقاء بأسلوب الذهبي النقدي الرفيع',
                color: 'bg-rose-50 border-rose-200',
                titleColor: 'text-rose-900',
              },
              {
                title: 'معرفة الرجال',
                author: 'ابن معين',
                death: '233 هـ',
                note: 'أقوال ابن معين المروية عنه في نقد الرواة',
                color: 'bg-teal-50 border-teal-200',
                titleColor: 'text-teal-900',
              },
            ].map((book, i) => (
              <div key={i} className={`rounded-xl border p-4 ${book.color}`}>
                <div className={`font-bold text-sm mb-1 ${book.titleColor}`}>{book.title}</div>
                <div className="text-xs text-gray-600 font-medium">{book.author}</div>
                <div className="text-xs text-gray-400 mb-2">ت {book.death}</div>
                <div className="text-xs text-gray-600 leading-relaxed">{book.note}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Bottom navigation */}
        <nav className="flex items-center gap-4 text-sm flex-wrap pt-2 border-t border-gray-100">
          <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين على الأحاديث</Link>
          <Link href="/scholars/activity" className="text-green-700 hover:underline">← نشاط علماء الجرح والتعديل</Link>
          <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات درجات الرواة</Link>
          <Link href="/narrators" className="text-green-700 hover:underline">← تصفح الرواة</Link>
        </nav>

      </main>
    </div>
  )
}
