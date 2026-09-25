import pool from '@/lib/db'
import Link from 'next/link'
import { attachMatnSnippets, snipColumns, type SnipPart } from '@/lib/matnSnippet'
import MatnMatchLine from '@/app/components/MatnMatchLine'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'محرك التخريج — جامع خادم الحرمين' }

interface VersionRow {
  group_id: number
  group_size: number
  matched_count: number
  seed_hadith_id: number
  is_seed: boolean
  hadith_id: number
  book_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_count: number
  judgment_text: string | null
  search_total: number
  snip_disp?: string[]
  snip_norm?: string[]
  snippet?: SnipPart[] | null
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export default async function TakhrijPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string }>
}) {
  const sp = await searchParams
  const query = (sp.q || '').trim()
  const method = sp.method === 'exact' ? 'exact' : 'text'

  let results: VersionRow[] = []
  let groupedByTakhrij = new Map<number, VersionRow[]>()

  if (query.length >= 3) {
    const terms = query.split(/\s+/).filter(Boolean)
    const searchPattern = method === 'exact'
      ? terms.map(escapeRegex).join('\\s+')
      : terms.map(escapeRegex).join('\\s+.*\\s+')

    const searchRes = await pool.query<VersionRow>(
      `WITH search_hits AS MATERIALIZED (
         SELECT ht.main_id AS hadith_id
         FROM hadith_toc ht
         JOIN books b ON b.id = ht.book_id
         WHERE ht.is_leaf = true
           AND ht.is_paragraph = true
           AND normalize_hadith(ht.tarf) ~* normalize_hadith($1)
         ORDER BY b.takhrij_death ASC NULLS LAST, ht.main_id
         LIMIT 100
       ),
       matched_groups AS MATERIALIZED (
         SELECT DISTINCT t.group_id, sh.hadith_id AS seed_hadith_id
         FROM takhrij t
         JOIN search_hits sh ON sh.hadith_id = t.hadith_id
         WHERE t.group_id IS NOT NULL
       ),
       group_stats AS (
         SELECT
           mg.group_id,
           MIN(mg.seed_hadith_id)::int AS seed_hadith_id,
           COUNT(DISTINCT t.hadith_id)::int AS group_size,
           COUNT(DISTINCT mg.seed_hadith_id)::int AS matched_count
         FROM matched_groups mg
         JOIN takhrij t ON t.group_id = mg.group_id
         GROUP BY mg.group_id
       ),
       ranked_members AS (
         SELECT
           gs.*,
           t.hadith_id,
           t.book_id,
           b.title AS book_name,
           b.takhrij_death,
           ht.chapter_text AS chapter_name,
           LEFT(regexp_replace(COALESCE(ht.tarf, ''), '<[^>]+>', ' ', 'g'), 350) AS hadith_text,
           ${snipColumns('ht.content')},
           ROW_NUMBER() OVER (
             PARTITION BY gs.group_id
             ORDER BY
               (t.hadith_id = gs.seed_hadith_id) DESC,
               b.takhrij_death ASC NULLS LAST,
               t.hadith_id
           ) AS member_rank
         FROM group_stats gs
         JOIN takhrij t ON t.group_id = gs.group_id
         JOIN hadith_toc ht
           ON ht.main_id = t.hadith_id
          AND ht.is_leaf = true
          AND ht.is_paragraph = true
         JOIN books b ON b.id = t.book_id
       )
       SELECT
         rm.group_id,
         rm.group_size,
         rm.matched_count,
         rm.seed_hadith_id,
         (rm.member_rank = 1) AS is_seed,
         rm.hadith_id,
         rm.book_id,
         rm.book_name,
         rm.takhrij_death AS book_death,
         rm.chapter_name,
         rm.hadith_text,
         rm.snip_disp,
         rm.snip_norm,
         (
           SELECT COUNT(DISTINCT ih.isnad_id)::int
           FROM isnad_hadiths ih
           WHERE ih.hadith_id = rm.hadith_id
         ) AS chain_count,
         (
           SELECT hj.say_text
           FROM hadith_judgments hj
           WHERE hj.hadith_id = rm.hadith_id
           ORDER BY hj.id
           LIMIT 1
         ) AS judgment_text,
         (SELECT COUNT(*)::int FROM search_hits) AS search_total
       FROM ranked_members rm
       WHERE rm.member_rank <= 12
       ORDER BY
         rm.group_size DESC,
         rm.matched_count DESC,
         rm.group_id,
         rm.member_rank`,
      [searchPattern]
    ).catch(error => {
      console.error('takhrij search failed:', error)
      return { rows: [] as VersionRow[] }
    })

    results = await attachMatnSnippets(searchRes.rows, [query])
    for (const row of results) {
      const group = groupedByTakhrij.get(row.group_id) || []
      group.push(row)
      groupedByTakhrij.set(row.group_id, group)
    }
  }

  const groupCount = groupedByTakhrij.size
  const searchTotal = Number(results[0]?.search_total || 0)

  function gradeClass(text: string | null | undefined): string {
    if (!text) return 'bg-gray-50 border-gray-100'
    if (/صحيح/.test(text)) return 'bg-green-50 border-green-200'
    if (/حسن/.test(text)) return 'bg-blue-50 border-blue-200'
    if (/ضعيف/.test(text)) return 'bg-red-50 border-red-200'
    if (/موضوع/.test(text)) return 'bg-red-100 border-red-300'
    return 'bg-gray-50 border-gray-100'
  }

  function gradeBadge(text: string): string {
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
          أدخل نصاً أو جزءاً من حديث لاستخراج الروايات الموازية مصنفةً بمجموعات التخريج، مع الأسانيد والأحكام.
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-900">
          <span className="font-semibold">كيفية الاستخدام: </span>
          اكتب جزءاً مميزاً من الحديث. تُعرض كل عضوية تخريج محفوظة للحديث، لا أول مجموعة فقط، ويُحسب عدد المجموعة كاملاً.
        </div>

        <form action="/takhrij" method="get" className="mb-4">
          <div className="flex gap-2 mb-2">
            <input
              name="q"
              defaultValue={query}
              placeholder="مثال: إنما الأعمال بالنيات..."
              className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:border-green-400 shadow-sm"
              dir="rtl"
            />
            <button
              type="submit"
              className="bg-green-800 text-white px-5 py-2 rounded-xl hover:bg-green-700 transition-colors font-medium"
            >
              استخرج
            </button>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span>طريقة البحث:</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="method" value="text" defaultChecked={method === 'text'} />
              <span>مرن (الكلمات مرتبة مع فواصل)</span>
            </label>
            <label className="flex items-center gap-1 cursor-pointer">
              <input type="radio" name="method" value="exact" defaultChecked={method === 'exact'} />
              <span>دقيق (الكلمات متصلة)</span>
            </label>
          </div>
        </form>

        <div className="flex flex-wrap gap-2 mb-4 text-xs">
          <span className="text-gray-400">أمثلة سريعة:</span>
          {[
            'إنما الأعمال بالنيات',
            'من كذب علي متعمداً',
            'الطهور شطر الإيمان',
            'بني الإسلام على خمس',
            'لا ضرر ولا ضرار',
            'الدين النصيحة',
          ].map(example => (
            <Link
              key={example}
              href={`/takhrij?q=${encodeURIComponent(example)}`}
              className="text-green-700 hover:underline bg-green-50 px-2 py-1 rounded-lg border border-green-100"
            >
              {example}
            </Link>
          ))}
        </div>
      </div>

      {query && (
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="text-sm font-bold text-green-900">نتائج التخريج: «{query}»</div>
            <span className="text-xs text-gray-500">
              {searchTotal > 0
                ? `${searchTotal.toLocaleString('ar-EG')} حديث مطابق في ${groupCount.toLocaleString('ar-EG')} مجموعة تخريج`
                : 'لا توجد نتائج'}
            </span>
          </div>

          {results.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
              <p>لم يُعثر على حديث مطابق في قاعدة البيانات</p>
              <p className="text-xs mt-1 text-gray-400">جرّب كلمات أقل، أو بدّل طريقة البحث.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(groupedByTakhrij.entries()).map(([groupId, versions], groupIndex) => {
                const groupSize = Number(versions[0]?.group_size || versions.length)
                const matchedCount = Number(versions[0]?.matched_count || 1)
                const seedHadithId = Number(versions[0]?.seed_hadith_id || versions[0]?.hadith_id)
                const bestJudgment = versions.map(version => version.judgment_text).find(Boolean)
                const sortedVersions = [...versions].sort((a, b) => {
                  if (a.is_seed !== b.is_seed) return a.is_seed ? -1 : 1
                  return (a.book_death || 9999) - (b.book_death || 9999)
                })

                return (
                  <section
                    key={groupId}
                    className={`rounded-xl border p-4 ${gradeClass(bestJudgment)}`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-gray-500">
                          مجموعة {(groupIndex + 1).toLocaleString('ar-EG')} · #{groupId.toLocaleString('ar-EG')}
                        </span>
                        <span className="text-xs bg-white/80 text-gray-600 border px-1.5 py-0.5 rounded-full">
                          {groupSize.toLocaleString('ar-EG')} رواية · {matchedCount.toLocaleString('ar-EG')} مطابقة
                        </span>
                        {bestJudgment && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeBadge(bestJudgment)}`}>
                            {bestJudgment.slice(0, 90)}
                          </span>
                        )}
                      </div>
                      <Link
                        href={`/hadith/${seedHadithId}/across-books`}
                        className="text-xs text-green-700 hover:underline shrink-0"
                      >
                        مقارنة كل الروايات ←
                      </Link>
                    </div>

                    <div className="space-y-2">
                      {sortedVersions.slice(0, 4).map(version => (
                        <div
                          key={`${groupId}-${version.hadith_id}`}
                          className="bg-white/70 rounded-lg p-2.5 border border-white/80"
                        >
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Link
                              href={`/books/${version.book_id}`}
                              className="text-xs font-bold text-green-800 hover:underline"
                            >
                              {version.book_name}
                            </Link>
                            {version.book_death && (
                              <span className="text-xs text-gray-400">ت {version.book_death}هـ</span>
                            )}
                            {version.chain_count > 0 && (
                              <span className="text-xs text-gray-400">{version.chain_count.toLocaleString('ar-EG')} سند</span>
                            )}
                            {version.is_seed && (
                              <span className="text-[10px] rounded-full bg-green-100 px-2 py-0.5 text-green-800">
                                مطابق للاستعلام
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-800 leading-relaxed line-clamp-2">
                            {version.hadith_text}
                            {version.hadith_text.length >= 350 ? '...' : ''}
                          </p>
                          {version.is_seed && <MatnMatchLine parts={version.snippet} />}
                          <Link
                            href={`/hadith/${version.hadith_id}`}
                            className="text-xs text-green-700 hover:underline mt-1 inline-block"
                          >
                            الحديث بأسانيده ←
                          </Link>
                        </div>
                      ))}

                      {groupSize > 4 && (
                        <Link
                          href={`/hadith/${seedHadithId}/across-books`}
                          className="block text-xs text-green-700 hover:underline text-center py-1"
                        >
                          +${(groupSize - 4).toLocaleString('ar-EG')} روايات أخرى — عرض المجموعة كاملة
                        </Link>
                      )}
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </div>
      )}

      {!query && (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 text-center">
          <UiIcon name="scroll" size={40} className="text-[#b28a43] mb-3" />
          <h2 className="text-lg font-bold text-green-900 mb-2">محرك التخريج الحديثي</h2>
          <p className="text-sm text-gray-500 max-w-lg mx-auto">
            أداة لاستخراج روايات الحديث وتصنيفها بمجموعات التخريج، مع إظهار العدد الحقيقي لكل مجموعة.
          </p>
        </div>
      )}
    </div>
  )
}
