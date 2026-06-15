import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'محرك التخريج — جامع خادم الحرمين' }

interface VersionRow {
  hadith_id: number
  book_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_count: number
  takhrij_id: number | null
}

interface JudgmentRow {
  hadith_id: number
  judgment_text: string
  scientist_name: string
}

export default async function TakhrijPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string }>
}) {
  const sp = await searchParams
  const query = (sp.q || '').trim()
  const method = sp.method || 'text'

  let results: VersionRow[] = []
  let judgments: JudgmentRow[] = []
  let groupedByTakhrij: Map<number | null, VersionRow[]> = new Map()

  if (query.length >= 5) {
    // normalize_hadith strips diacritics and normalises hamza/ta-marbuta so user can
    // search without diacritics (e.g. "إنما الأعمال" matches "إِنَّمَا الْأَعْمَالُ")
    const searchPattern = method === 'exact' ? query : query.replace(/\s+/g, '.*')

    const [searchRes, judgmentsRes] = await Promise.all([
      pool.query<VersionRow>(
        `SELECT DISTINCT ON (ht.main_id)
                ht.main_id AS hadith_id,
                ht.book_id,
                b.title AS book_name,
                b.takhrij_death AS book_death,
                ht.chapter_text AS chapter_name,
                LEFT(regexp_replace(COALESCE(ht.tarf, ''), '<[^>]+>', ' ', 'g'), 350) AS hadith_text,
                tk.group_id AS takhrij_id,
                (SELECT COUNT(DISTINCT ic.id)::int
                 FROM isnad_chains ic
                 JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
                 WHERE ih.hadith_id = ht.main_id) AS chain_count
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         LEFT JOIN takhrij tk ON tk.hadith_id = ht.main_id
         WHERE ht.is_leaf = true
           AND ht.is_paragraph = true
           AND normalize_hadith(ht.tarf) ~* normalize_hadith($1)
         ORDER BY ht.main_id, b.takhrij_death ASC NULLS LAST
         LIMIT 100`,
        [searchPattern]
      ).catch(() => ({ rows: [] as VersionRow[] })),

      pool.query<JudgmentRow>(
        `SELECT DISTINCT ON (hj.hadith_id)
                hj.hadith_id,
                hj.say_text AS judgment_text,
                n.name AS scientist_name
         FROM hadith_judgments hj
         LEFT JOIN narrators n ON n.id = hj.scientist_id
         WHERE hj.hadith_id IN (
           SELECT ht2.main_id FROM hadith_toc ht2
           WHERE ht2.is_leaf = true AND ht2.is_paragraph = true
             AND normalize_hadith(ht2.tarf) ~* normalize_hadith($1)
           LIMIT 100
         )
         ORDER BY hj.hadith_id`,
        [searchPattern]
      ).catch(() => ({ rows: [] })),
    ])

    results = searchRes.rows
    judgments = judgmentsRes.rows

    // Group by takhrij_id
    for (const row of results) {
      const key = row.takhrij_id
      if (!groupedByTakhrij.has(key)) groupedByTakhrij.set(key, [])
      groupedByTakhrij.get(key)!.push(row)
    }
  }

  const judgmentMap = new Map(judgments.map(j => [j.hadith_id, j]))
  const groupCount = groupedByTakhrij.size

  function gradeClass(text: string | undefined): string {
    if (!text) return 'bg-gray-50 border-gray-100'
    if (/صحيح/.test(text)) return 'bg-green-50 border-green-200'
    if (/حسن/.test(text)) return 'bg-blue-50 border-blue-200'
    if (/ضعيف/.test(text)) return 'bg-red-50 border-red-200'
    if (/موضوع/.test(text)) return 'bg-red-100 border-red-300'
    return 'bg-gray-50 border-gray-100'
  }

  function gradeBadge(text: string | undefined): string {
    if (!text) return 'bg-gray-100 text-gray-500'
    if (/صحيح/.test(text)) return 'bg-green-100 text-green-800'
    if (/حسن/.test(text)) return 'bg-blue-100 text-blue-800'
    if (/ضعيف/.test(text)) return 'bg-red-100 text-red-700'
    if (/موضوع/.test(text)) return 'bg-red-200 text-red-900'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">محرك التخريج</h1>
        <p className="text-sm text-gray-500 mb-3">
          أدخل نصاً أو جزءاً من حديث لاستخراج جميع رواياته الموازية مصنَّفةً بمجموعات التخريج —
          مع أسانيدها وأحكام العلماء
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-900">
          <span className="font-semibold">كيفية الاستخدام: </span>
          اكتب جزءاً مميزاً من الحديث (يُفضَّل 5 كلمات أو أكثر). ستجد جميع الروايات الموازية مجموعةً
          بحسب مجموعات التخريج، مع عدد الأسانيد والأحكام. كل مجموعة = متابعات وشواهد لبعضها.
        </div>

        <form action="/takhrij" method="get" className="mb-4">
          <div className="flex gap-2 mb-2">
            <input name="q" defaultValue={query}
              placeholder="مثال: إنما الأعمال بالنيات..."
              className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-400 shadow-sm"
              dir="rtl" />
            <button type="submit"
              className="bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium">
              استخرج
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>طريقة البحث:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="method" value="text" defaultChecked={method === 'text'} />
              <span>مرن (الكلمات بأي ترتيب)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="method" value="exact" defaultChecked={method === 'exact'} />
              <span>دقيق (النص كما هو)</span>
            </label>
          </div>
        </form>

        {/* Quick examples */}
        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className="text-gray-400">أمثلة سريعة:</span>
          {[
            'إنما الأعمال بالنيات',
            'من كذب علي متعمداً',
            'الطهور شطر الإيمان',
            'بني الإسلام على خمس',
            'لا ضرر ولا ضرار',
            'الدين النصيحة',
          ].map(ex => (
            <Link key={ex}
              href={`/takhrij?q=${encodeURIComponent(ex)}`}
              className="text-green-700 hover:underline bg-green-50 px-2 py-1 rounded-lg border border-green-100">
              {ex}
            </Link>
          ))}
        </div>
      </div>

      {query && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-sm font-bold text-green-900">
              نتائج التخريج: "{query}"
            </div>
            <span className="text-xs text-gray-500">
              {results.length} رواية في {groupCount} مجموعة تخريج
            </span>
          </div>

          {results.length === 0 && (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
              <p>لم يُعثر على الحديث في قاعدة البيانات</p>
              <p className="text-xs mt-1 text-gray-400">جرب كلمات أقل أو أدقَّ</p>
            </div>
          )}

          <div className="space-y-4">
            {Array.from(groupedByTakhrij.entries()).map(([takhrij_id, versions], groupIdx) => {
              const bestJudgment = versions
                .map(v => judgmentMap.get(v.hadith_id))
                .find(j => j !== undefined)
              const totalChains = versions.reduce((s, v) => s + v.chain_count, 0)
              const sortedVersions = [...versions].sort((a, b) =>
                (a.book_death || 9999) - (b.book_death || 9999)
              )

              return (
                <div key={takhrij_id ?? `no-group-${groupIdx}`}
                  className={`rounded-xl border p-4 ${gradeClass(bestJudgment?.judgment_text)}`}>
                  <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-gray-500">
                        مجموعة {(groupIdx + 1).toLocaleString('ar-EG')}
                      </span>
                      <span className="text-xs bg-white/80 text-gray-600 border px-1.5 py-0.5 rounded-full">
                        {versions.length} رواية — {totalChains} سند
                      </span>
                      {bestJudgment && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeBadge(bestJudgment.judgment_text)}`}>
                          {bestJudgment.judgment_text}
                        </span>
                      )}
                    </div>
                    {takhrij_id && (
                      <Link href={`/hadith/${versions[0].hadith_id}/across-books`}
                        className="text-xs text-green-700 hover:underline shrink-0">
                        مقارنة الروايات ←
                      </Link>
                    )}
                  </div>

                  <div className="space-y-2">
                    {sortedVersions.slice(0, 4).map(v => (
                      <div key={v.hadith_id}
                        className="bg-white/70 rounded-lg p-2.5 border border-white/80">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <Link href={`/books/${v.book_id}`}
                            className="text-xs font-bold text-green-800 hover:underline">
                            {v.book_name}
                          </Link>
                          {v.book_death && (
                            <span className="text-xs text-gray-400">ت {v.book_death}هـ</span>
                          )}
                          {v.chain_count > 0 && (
                            <span className="text-xs text-gray-400">{v.chain_count} سند</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-800 leading-relaxed line-clamp-2">
                          {v.hadith_text}{v.hadith_text?.length >= 350 ? '...' : ''}
                        </p>
                        <Link href={`/hadith/${v.hadith_id}`}
                          className="text-xs text-green-700 hover:underline mt-1 inline-block">
                          الحديث بأسانيده ←
                        </Link>
                      </div>
                    ))}
                    {versions.length > 4 && (
                      <div className="text-xs text-gray-400 text-center py-1">
                        + {(versions.length - 4).toLocaleString('ar-EG')} روايات أخرى
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {!query && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <div className="text-4xl mb-3">📜</div>
          <h2 className="text-lg font-bold text-green-900 mb-2">محرك التخريج الحديثي</h2>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            أداة لاستخراج جميع روايات حديث ما وتصنيفها بمجموعات التخريج —
            تعادل ما يفعله الباحث يدوياً من تتبع الحديث في كتب السنة وجمع طرقه وأسانيده
          </p>
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/search" className="text-green-700 hover:underline">← البحث المتقدم</Link>
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
        <Link href="/matn-compare" className="text-green-700 hover:underline">← مقارنة المتون</Link>
      </div>
    </div>
  )
}
