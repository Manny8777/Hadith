import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'ربط بالمخالف — مختلف الحديث — جامع خادم الحرمين' }

interface ConflictPair {
  group_id: string
  hadith1: number
  grade1: string
  tarf1: string | null
  book1: string | null
  hadith2: number
  grade2: string
  tarf2: string | null
  book2: string | null
}

interface TopCatRow {
  id: number
  title: string
  hadith_count: number
}

interface StatsRow {
  total_hadiths: number
  mokhtalaf_count: number
}

function gradeColor(grade: string): string {
  if (grade === 'صحيح') return 'bg-green-100 text-green-800 border-green-200'
  if (grade === 'حسن') return 'bg-amber-100 text-amber-800 border-amber-200'
  return 'bg-red-100 text-red-800 border-red-200'
}

function gradeArrow(g1: string, g2: string): string {
  if (g1 === 'صحيح' && g2 === 'ضعيف') return 'صحيح ← → ضعيف'
  if (g1 === 'ضعيف' && g2 === 'صحيح') return 'ضعيف ← → صحيح'
  return `${g1} ← → ${g2}`
}

export default async function ContradictionsPage() {
  // ── 1. Try to get conflict pairs from takhrij + hadith_judgments ──────────────
  let pairs: ConflictPair[] = []
  let pairsError = false

  try {
    const result = await pool.query<ConflictPair>(
      `WITH graded AS (
        SELECT DISTINCT ON (t.hadith_id)
          t.group_id,
          t.hadith_id,
          CASE
            WHEN j.say_text ~* 'صحيح' AND j.say_text !~* 'ضعيف|لا يصح|غير صحيح' THEN 'صحيح'
            WHEN j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن|حسن لغيره|حسن صحيح'
                 AND j.say_text !~* 'ضعيف|ليس بحسن' THEN 'حسن'
            WHEN j.say_text ~* 'ضعيف|منكر|موضوع|مكذوب|باطل|لا يصح' THEN 'ضعيف'
          END AS grade
        FROM takhrij t
        JOIN hadith_judgments j ON j.hadith_id = t.hadith_id
        WHERE t.group_id IS NOT NULL
          AND (
            j.say_text ~* 'صحيح'
            OR j.say_text ~* 'إسناده حسن|حديث حسن|سنده حسن'
            OR j.say_text ~* 'ضعيف|منكر|موضوع'
          )
        ORDER BY t.hadith_id, j.id
      ),
      conflict_pairs AS (
        SELECT DISTINCT
          g1.group_id,
          LEAST(g1.hadith_id, g2.hadith_id)  AS hadith1,
          CASE WHEN g1.hadith_id < g2.hadith_id THEN g1.grade ELSE g2.grade END AS grade1,
          GREATEST(g1.hadith_id, g2.hadith_id) AS hadith2,
          CASE WHEN g1.hadith_id < g2.hadith_id THEN g2.grade ELSE g1.grade END AS grade2
        FROM graded g1
        JOIN graded g2
          ON g2.group_id = g1.group_id
          AND g2.hadith_id <> g1.hadith_id
          AND g1.grade IS NOT NULL AND g2.grade IS NOT NULL
          AND (
            (g1.grade = 'صحيح' AND g2.grade = 'ضعيف')
            OR (g1.grade = 'ضعيف' AND g2.grade = 'صحيح')
            OR (g1.grade = 'حسن'  AND g2.grade = 'ضعيف')
            OR (g1.grade = 'ضعيف' AND g2.grade = 'حسن')
          )
      )
      SELECT
        cp.group_id,
        cp.hadith1,
        cp.grade1,
        regexp_replace(coalesce(ht1.tarf, ''), '<[^>]+>', ' ', 'g') AS tarf1,
        b1.title AS book1,
        cp.hadith2,
        cp.grade2,
        regexp_replace(coalesce(ht2.tarf, ''), '<[^>]+>', ' ', 'g') AS tarf2,
        b2.title AS book2
      FROM conflict_pairs cp
      LEFT JOIN hadith_toc ht1 ON ht1.main_id = cp.hadith1 AND ht1.is_leaf = true AND ht1.is_paragraph = true
      LEFT JOIN books b1 ON b1.id = ht1.book_id
      LEFT JOIN hadith_toc ht2 ON ht2.main_id = cp.hadith2 AND ht2.is_leaf = true AND ht2.is_paragraph = true
      LEFT JOIN books b2 ON b2.id = ht2.book_id
      LIMIT 40`,
      []
    )
    pairs = result.rows
  } catch {
    pairsError = true
  }

  // ── 2. Stats: how many hadiths are flagged as mokhtalaf in hadith_services ─────
  let stats: StatsRow = { total_hadiths: 0, mokhtalaf_count: 0 }
  try {
    const statsRes = await pool.query<StatsRow>(
      `SELECT
         (SELECT COUNT(*)::int FROM hadith_toc WHERE is_leaf = true AND is_paragraph = true) AS total_hadiths,
         (SELECT COUNT(*)::int FROM hadith_services WHERE mokhtalaf = true) AS mokhtalaf_count`
    )
    stats = statsRes.rows[0] || stats
  } catch { /* ignore */ }

  // ── 3. Top-level topic categories for the "coming soon" context card ────────────
  let topCats: TopCatRow[] = []
  try {
    const catsRes = await pool.query<TopCatRow>(
      `SELECT sc.id, sc.title,
              COUNT(DISTINCT hs.id)::int AS hadith_count
       FROM subject_categories sc
       LEFT JOIN subject_items si
         ON si.left_value > sc.left_value AND si.right_value < sc.right_value AND si.is_leaf = true
       LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
       WHERE sc.parent_id = 1
       GROUP BY sc.id, sc.title, sc.left_value
       ORDER BY sc.left_value
       LIMIT 12`
    )
    topCats = catsRes.rows
  } catch { /* ignore */ }

  const hasPairs = !pairsError && pairs.length > 0
  const mokhtalafCount = stats.mokhtalaf_count || 0

  return (
    <div dir="rtl">
      {/* ── Breadcrumb ── */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/topics" className="text-green-700 hover:underline">الفهارس الموضوعية</Link>
        <span>/</span>
        <span className="text-gray-600">ربط بالمخالف</span>
      </div>

      {/* ── Title ── */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">ربط بالمخالف</h1>
        <p className="text-gray-500 text-sm">
          الحديث المعارض — دراسة الروايات المتعارضة في ظاهرها وطرق الجمع والترجيح
        </p>
      </div>

      {/* ── Academic explanation card ── */}
      <div className="bg-green-50 border border-green-100 rounded-2xl p-6 mb-6">
        <h2 className="text-lg font-bold text-green-900 mb-3">مختلف الحديث في علوم الحديث</h2>
        <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
          <p>
            <span className="font-semibold text-green-800">مختلف الحديث</span> هو علمٌ شريف من علوم الحديث النبوي يُعنى
            بالأحاديث التي يبدو في ظاهرها التعارض والتناقض، ويبحث في طرق رفع هذا التعارض الظاهري. وقد
            أُفرد بالتصنيف قديماً، وأشهر ما كُتب فيه كتاب <span className="font-semibold">«اختلاف الحديث»</span> للإمام الشافعي،
            و<span className="font-semibold">«تأويل مختلف الحديث»</span> لابن قتيبة الدينوري.
          </p>
          <p>
            <span className="font-semibold text-green-800">طرق الجمع بين المتعارضين:</span> يسلك العلماء في رفع التعارض الظاهري
            مسالك منهجية مرتبة: أولها <span className="font-semibold">الجمع</span> بحمل كل حديث على حال أو وجه يختلف عن الآخر،
            ثم <span className="font-semibold">النسخ</span> إن ثبت التأخر، ثم <span className="font-semibold">الترجيح</span>
            بين الروايات بالنظر في قرائن الثقة والاتصال، ثم <span className="font-semibold">التوقف</span> إن تعذّرت المسالك السابقة.
          </p>
          <p>
            <span className="font-semibold text-green-800">التعارض في درجة الحديث:</span> من صور التعارض العملية ما يظهر حين يصحِّح
            عالمٌ حديثاً ويضعِّفه آخر. وهذا ليس تناقضاً في الرواية ذاتها بل هو خلاف في التقدير النقدي، ينشأ عن تفاوت
            في منهج التوثيق والتجريح، أو في مقدار الانقطاع في السند، أو في الحكم على بعض الرواة.
          </p>
        </div>
      </div>

      {/* ── Mokhtalaf stats banner ── */}
      {mokhtalafCount > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-white border border-gray-100 rounded-xl p-4 text-center shadow-sm">
            <div className="text-2xl font-bold text-green-800">
              {mokhtalafCount.toLocaleString('ar-EG')}
            </div>
            <div className="text-xs text-gray-500 mt-1">حديث مخالف مُسنَد</div>
          </div>
          {stats.total_hadiths > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-green-800">
                {Math.round((mokhtalafCount / stats.total_hadiths) * 100)}%
              </div>
              <div className="text-xs text-gray-500 mt-1">من إجمالي الأحاديث</div>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center shadow-sm">
            <div className="text-sm font-semibold text-amber-800">قريباً</div>
            <div className="text-xs text-amber-600 mt-1">شجرة مختلف الحديث الكاملة</div>
          </div>
        </div>
      )}

      {/* ── Main content: conflict pairs OR coming-soon ── */}
      {hasPairs ? (
        <>
          <div className="mb-4 flex items-center gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-green-900">
              أمثلة على روايات متعارضة في التخريج
            </h2>
            <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full border border-green-200">
              {pairs.length} زوج متعارض
            </span>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-5 text-xs text-amber-800">
            <span className="font-semibold">ملاحظة منهجية: </span>
            الأزواج المعروضة مستخرجة من مجموعات التخريج — روايات تشترك في المتن لكن تختلف أحكام العلماء على أسانيدها.
            هذا التعارض في التقدير النقدي هو أحد أبعاد مختلف الحديث.
          </div>

          <div className="space-y-4">
            {pairs.map((pair, idx) => (
              <div
                key={`${pair.hadith1}-${pair.hadith2}`}
                className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 hover:shadow-md hover:border-green-200 transition-all"
              >
                {/* Header */}
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs text-gray-300 font-mono">{idx + 1}</span>
                  <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-medium">
                    {gradeArrow(pair.grade1, pair.grade2)}
                  </span>
                  {pair.group_id && (
                    <span className="text-xs text-gray-400">
                      مجموعة {pair.group_id}
                    </span>
                  )}
                </div>

                {/* Two-column pair display */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Hadith 1 */}
                  <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${gradeColor(pair.grade1)}`}>
                        {pair.grade1}
                      </span>
                      {pair.book1 && (
                        <span className="text-xs text-gray-400 truncate">{pair.book1}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed mb-2">
                      {(pair.tarf1 || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
                      {(pair.tarf1 || '').length > 180 && <span className="text-gray-400">…</span>}
                    </p>
                    <Link
                      href={`/hadith/${pair.hadith1}`}
                      className="text-xs text-green-700 hover:underline"
                    >
                      عرض الحديث ←
                    </Link>
                  </div>

                  {/* Hadith 2 */}
                  <div className="rounded-xl border border-gray-100 p-4 bg-gray-50/50">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${gradeColor(pair.grade2)}`}>
                        {pair.grade2}
                      </span>
                      {pair.book2 && (
                        <span className="text-xs text-gray-400 truncate">{pair.book2}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed mb-2">
                      {(pair.tarf2 || '').replace(/\s+/g, ' ').trim().slice(0, 180)}
                      {(pair.tarf2 || '').length > 180 && <span className="text-gray-400">…</span>}
                    </p>
                    <Link
                      href={`/hadith/${pair.hadith2}`}
                      className="text-xs text-green-700 hover:underline"
                    >
                      عرض الحديث ←
                    </Link>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="mt-3 flex items-center gap-3 text-xs text-gray-400 flex-wrap border-t border-gray-100 pt-3">
                  <Link href={`/hadith/${pair.hadith1}/witnesses`} className="hover:text-green-700">
                    شواهد الأول ←
                  </Link>
                  <Link href={`/hadith/${pair.hadith2}/witnesses`} className="hover:text-green-700">
                    شواهد الثاني ←
                  </Link>
                  <Link href={`/hadith/${pair.hadith1}/chain-analysis`} className="hover:text-green-700">
                    تحليل السند ←
                  </Link>
                  <Link href={`/hadiths/grade-dispute`} className="hover:text-green-700 mr-auto">
                    الأحاديث المختلف في درجتها ←
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── Coming soon / full feature explanation ── */
        <div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 mb-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-green-900 mb-2">شجرة مختلف الحديث — قريباً</h2>
            <p className="text-sm text-gray-600 leading-relaxed max-w-xl mx-auto mb-4">
              تحتوي قاعدة البيانات الأصلية على شجرة متكاملة لمختلف الحديث تضمّ
              <span className="font-semibold text-green-800"> 1,189 عقدة</span> موضوعية مرتبة هرمياً،
              مع <span className="font-semibold text-green-800">1,165 ربطاً</span> تصل كل عقدة بالروايات المتعارضة المقابلة.
              يجري حالياً ترحيل هذه البيانات إلى قاعدة البيانات المركزية لإتاحة هذه الميزة كاملةً.
            </p>
            <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs px-4 py-2 rounded-full">
              <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
              قيد الترحيل من قاعدة البيانات الأصلية
            </div>
          </div>

          {/* What the full feature will include */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                ),
                label: 'شجرة الموضوعات',
                desc: '1,189 موضوع مصنَّف هرمياً ضمن أبواب مختلف الحديث',
              },
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M14.828 14.828a4 4 0 015.656 0l4-4a4 4 0 01-5.656-5.656l-1.1 1.1" />
                  </svg>
                ),
                label: 'ربط الروايات',
                desc: 'كل موضوع مرتبط بالأحاديث المتعارضة المقابلة له مباشرةً',
              },
              {
                icon: (
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
                  </svg>
                ),
                label: 'أدوات الترجيح',
                desc: 'مقارنة الأسانيد وعرض مناهج العلماء في الجمع والترجيح',
              },
            ].map(item => (
              <div key={item.label} className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <div className="text-green-700 mb-3">{item.icon}</div>
                <h3 className="text-sm font-bold text-green-900 mb-1">{item.label}</h3>
                <p className="text-xs text-gray-500 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>

          {pairsError && (
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-5 text-xs text-red-700">
              <span className="font-semibold">تنبيه: </span>
              تعذَّر استعراض أمثلة التعارض في هذه الجلسة بسبب خطأ في الاستعلام — يُرجى المحاولة لاحقاً.
            </div>
          )}
        </div>
      )}

      {/* ── Explore related topics ── */}
      {topCats.length > 0 && (
        <div className="mt-8">
          <h2 className="text-base font-bold text-green-900 mb-3">استكشاف الموضوعات</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {topCats.map(cat => (
              <Link
                key={cat.id}
                href={`/topics/${cat.id}`}
                className="group block bg-white border border-gray-100 rounded-xl p-3 hover:border-green-200 hover:shadow-sm transition-all"
              >
                <div className="text-sm font-medium text-green-900 group-hover:text-green-700 truncate">
                  {cat.title}
                </div>
                {cat.hadith_count > 0 && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    {cat.hadith_count.toLocaleString('ar-EG')} حديث
                  </div>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── Related links ── */}
      <div className="mt-8 bg-white border border-gray-100 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-green-900 mb-3">روابط ذات صلة</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { href: '/topics', label: 'الفهارس الموضوعية الكاملة' },
            { href: '/hadiths/grade-dispute', label: 'الأحاديث المختلف في درجتها' },
            { href: '/hadiths/ilal', label: 'علل الأحاديث' },
            { href: '/hadiths/weak-supported', label: 'الضعيف المعتضد بالشواهد' },
            { href: '/scholars/judgment-search', label: 'أحكام العلماء على الأحاديث' },
            { href: '/topics/stats', label: 'إحصاءات الموضوعات' },
          ].map(link => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-green-700 hover:text-green-900 hover:underline py-1"
            >
              {link.label} ←
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
