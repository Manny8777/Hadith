export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { attachMatnSnippets, snipColumns, type SnipPart } from '@/lib/matnSnippet'
import MatnMatchLine from '@/app/components/MatnMatchLine'
import { notFound } from 'next/navigation'
import TopicExport from '@/app/components/TopicExport'
import HadithNumber from '@/app/components/HadithNumber'
import TopicSearchForm from '@/app/components/TopicSearchForm'
import { buildTopicUrl, parseTopicUrl, type SearchGrade, type TopicUrlPatch, type TopicView } from '@/lib/urlState'

interface SubjectItem {
  id: number
  title: string
  parent_id: number
  is_leaf: boolean
}

interface HadithRow {
  main_id: number
  book_id: number
  book_name: string
  tarf: string | null
  part_num: number
  page_num: number
  section_text: string | null
  chapter_text: string | null
  tarqeem_harf: string | null
  tarqeem_matboa1: string | null
  grade_hint?: string | null
  // match line, attached by attachMatnSnippets (lib/matnSnippet.ts)
  snippet?: SnipPart[] | null
}

interface ChildItem {
  id: number
  title: string
  is_leaf: boolean
  left_value: number
  hadith_count: string
}

interface GradeStat {
  grade_class: string
  cnt: number
}

interface TopCompanion {
  id: number
  name: string
  cnt: number
}

function stripTags(html: string): string {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function TopicItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ page?: string; grade?: string; q?: string; view?: string; [key: string]: string | string[] | undefined }>
}) {
  const { id }   = await params
  const rawSearchParams = await searchParams
  const itemId = parseInt(id, 10)
  if (!Number.isSafeInteger(itemId) || itemId <= 0) notFound()

  const queryString = new URLSearchParams()
  for (const [key, value] of Object.entries(rawSearchParams)) {
    if (Array.isArray(value)) value.forEach(item => queryString.append(key, item))
    else if (value !== undefined) queryString.set(key, value)
  }
  const urlState = parseTopicUrl(queryString)
  const { page, grade, q, view: requestedView } = urlState
  const limit  = 20
  const offset = (page - 1) * limit
  const topicHref = (patch: TopicUrlPatch = {}) => buildTopicUrl(itemId, queryString, patch)
  const topicViewHref = (nextView: TopicView) => topicHref({ view: nextView })
  const topicGradeHref = (nextGrade: SearchGrade) => topicHref({ grade: nextGrade })

  const itemRes = await pool.query<SubjectItem>(
    `SELECT id, title, parent_id, is_leaf FROM subject_items WHERE id = $1`,
    [itemId]
  )
  if (!itemRes.rows[0]) notFound()
  const item = itemRes.rows[0]

  // Get parent for breadcrumb
  const parentRes = await pool.query(
    `SELECT id, title FROM subject_categories WHERE id = $1`,
    [item.parent_id]
  )
  const parent = parentRes.rows[0] || null

  // Grade distribution and top companions — only for leaf-level items
  const [gradeStatsRes, topCompanionsRes] = await Promise.all([
    pool.query<GradeStat>(
      `SELECT hj.grade_class, COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
       FROM hadith_subjects hs
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
       WHERE hs.subject_id = $1 AND hj.grade_class IS NOT NULL
       GROUP BY hj.grade_class
       ORDER BY cnt DESC`,
      [itemId]
    ).catch(() => ({ rows: [] })),
    // Top companions: join through isnad_tree (rawy_id) + isnad_relations
    // using tabaqa to identify Sahaba (non-empty tabaqa indicates companion generation)
    pool.query<TopCompanion>(
      `SELECT n.id, n.name, COUNT(DISTINCT hs.paragraph_main_id)::int AS cnt
       FROM hadith_subjects hs
       JOIN isnad_relations ir ON ir.hadith_main_id = hs.paragraph_main_id
       JOIN isnad_tree it ON it.id = ir.sand_id AND it.rawy_id IS NOT NULL
       JOIN narrators n ON n.id = it.rawy_id AND n.tabaqa <> ''
       WHERE hs.subject_id = $1
       GROUP BY n.id, n.name
       ORDER BY cnt DESC
       LIMIT 8`,
      [itemId]
    ).catch(() => ({ rows: [] })),
  ])
  const gradeStats: GradeStat[] = gradeStatsRes.rows
  const topCompanions: TopCompanion[] = topCompanionsRes.rows

  // A topic branch can itself own hadiths as well as having child topics. The old page hid those
  // direct hadiths, making thousands of records unreachable. Keep both surfaces behind an explicit view.
  const { rows: topicMeta } = await pool.query<{ has_children: boolean; child_count: number; direct_hadiths: number }>(
    `SELECT
       EXISTS (SELECT 1 FROM subject_items child WHERE child.parent_id = $1) AS has_children,
       (SELECT COUNT(*)::int FROM subject_items WHERE parent_id = $1) AS child_count,
       (SELECT COUNT(DISTINCT paragraph_main_id) FROM hadith_subjects WHERE subject_id = $1)::int AS direct_hadiths`,
    [itemId]
  )
  const hasChildren = Boolean(topicMeta[0]?.has_children)
  const childTotal = Number(topicMeta[0]?.child_count || 0)
  const directHadithTotal = Number(topicMeta[0]?.direct_hadiths || 0)
  const view = hasChildren ? requestedView : 'hadiths'

  const { rows: children } = hasChildren && view === 'children'
    ? await pool.query<ChildItem>(
        `SELECT si.id, si.title, si.is_leaf, si.left_value,
                COUNT(DISTINCT hs.paragraph_main_id) AS hadith_count
         FROM subject_items si
         LEFT JOIN hadith_subjects hs ON hs.subject_id = si.id
         WHERE si.parent_id = $1
         GROUP BY si.id
         ORDER BY si.left_value
         LIMIT $2 OFFSET $3`,
        [itemId, limit, offset]
      )
    : { rows: [] as ChildItem[] }

  // Get hadiths for leaves and for the explicit direct-hadiths view of a branch
  let hadiths: HadithRow[] = []
  let total = 0
  let pages = 0

  if (hasChildren && view === 'children') {
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*) FROM subject_items WHERE parent_id = $1`,
      [itemId]
    )
    total = parseInt(countRows[0].count)
    pages = Math.ceil(total / limit)
  } else {
    // Build grade condition
    let gradeJoin = ''
    if (grade === 'sahih') gradeJoin = `AND jg.grade_hint = 'صحيح'`
    else if (grade === 'hasan') gradeJoin = `AND jg.grade_hint = 'حسن'`
    else if (grade === 'daif') gradeJoin = `AND jg.grade_hint = 'ضعيف'`

    // The stored hadith content is marked-up: 276,353 of 276,355 leaf rows carry tags/attributes
    // (e.g. <متن>, <رقم_حديث نوع="مطبوع">, hidden matn in نص="…"). The original app indexes element
    // text only, so tag and attribute text must not be searchable — searching the raw column
    // matched basically every row for common tag words. Same fix as app/api/search/route.ts.
    const visible = `regexp_replace(coalesce(h.content,''), '<[^>]*>', ' ', 'g')`

    const textClause = q.length >= 2
      ? `AND (to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith($4))
           OR to_tsvector('simple', normalize_hadith(${visible})) @@ plainto_tsquery('simple', normalize_hadith($4)))`
      : ''

    const { rows } = await pool.query<HadithRow>(
      `SELECT DISTINCT h.main_id, h.book_id, b.title AS book_name, h.tarf, h.part_num, h.page_num,
              h.section_text, h.chapter_text, h.tarqeem_harf, h.tarqeem_matboa1, jg.grade_hint,
              ${snipColumns('h.content')}
       FROM hadith_subjects hs
       JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
       JOIN books b ON b.id = h.book_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END as grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = h.main_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE
           WHEN j2.say_text ~* 'صحيح' THEN 1
           WHEN j2.say_text ~* 'حسن' THEN 2
           WHEN j2.say_text ~* 'ضعيف|منكر|متروك' THEN 3
           ELSE 4 END
         LIMIT 1
       ) jg ON true
       WHERE hs.subject_id = $1
         ${gradeJoin ? `AND jg.grade_hint IS NOT NULL ${gradeJoin}` : ''}
         ${textClause}
       ORDER BY h.book_id, h.main_id
       LIMIT $2 OFFSET $3`,
      q.length >= 2 ? [itemId, limit, offset, q] : [itemId, limit, offset]
    )
    hadiths = await attachMatnSnippets(rows, [q])

    const hasTextFilter = q.length >= 2
    const hasGradeFilter = !!grade

    let countQuery: string
    let countParams: (string | number)[]

    if (hasGradeFilter || hasTextFilter) {
      const countTextClause = hasTextFilter
        ? `AND (to_tsvector('simple', normalize_hadith(coalesce(h.tarf,''))) @@ plainto_tsquery('simple', normalize_hadith($${hasGradeFilter ? 2 : 2}))
             OR to_tsvector('simple', normalize_hadith(${visible})) @@ plainto_tsquery('simple', normalize_hadith($${hasGradeFilter ? 2 : 2})))`
        : ''
      countQuery = `SELECT COUNT(DISTINCT hs.paragraph_main_id) FROM hadith_subjects hs
         JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL END as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = h.main_id
             AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
           LIMIT 1
         ) jg ON true
         WHERE hs.subject_id = $1
           ${hasGradeFilter ? `AND jg.grade_hint IS NOT NULL ${gradeJoin}` : ''}
           ${countTextClause}`
      countParams = hasTextFilter ? [itemId, q] : [itemId]
    } else {
      countQuery = `SELECT COUNT(DISTINCT paragraph_main_id) FROM hadith_subjects WHERE subject_id = $1`
      countParams = [itemId]
    }

    const { rows: countRows } = await pool.query(countQuery, countParams)
    total = parseInt(countRows[0].count)
    pages = Math.ceil(total / limit)
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-6 flex-wrap">
        <Link href="/topics" className="text-green-700 hover:underline">
          الفهارس الموضوعية
        </Link>
        {parent && (
          <>
            <span>←</span>
            <Link href={`/topics/${parent.id}`} className="text-green-700 hover:underline">
              {parent.title}
            </Link>
          </>
        )}
        <span>←</span>
        <span className="text-gray-700">{item.title}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-green-900 mb-1">{item.title}</h1>
            <p className="text-gray-500 text-sm">
              {directHadithTotal.toLocaleString('ar-SA')} حديث مرتبط مباشرة
              {hasChildren && ` · ${childTotal.toLocaleString('ar-SA')} موضوع فرعي`}
            </p>
          </div>
          {directHadithTotal > 0 && (
            <TopicExport topicId={itemId} topicTitle={item.title} />
          )}
        </div>
      </div>

      {hasChildren && (
        <nav className="mb-5 flex flex-wrap gap-2 border-b border-gray-200 pb-3" aria-label="عرض الموضوع">
          <Link
            href={topicViewHref('children')}
            aria-current={view === 'children' ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium ${
              view === 'children'
                ? 'bg-green-900 text-white'
                : 'bg-white text-green-800 border border-green-200 hover:bg-green-50'
            }`}
          >
            الموضوعات الفرعية ({childTotal.toLocaleString('ar-EG')})
          </Link>
          {directHadithTotal > 0 && (
            <Link
              href={topicViewHref('hadiths')}
              aria-current={view === 'hadiths' ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-sm font-medium ${
                view === 'hadiths'
                  ? 'bg-green-900 text-white'
                  : 'bg-white text-green-800 border border-green-200 hover:bg-green-50'
              }`}
            >
              الأحاديث المرتبطة مباشرة ({directHadithTotal.toLocaleString('ar-EG')})
            </Link>
          )}
        </nav>
      )}

      {/* Sub-items (non-leaf node) */}
      {hasChildren && view === 'children' && (
        <div className="grid grid-cols-1 gap-2">
          {children.map(child => {
            const hadithCount = parseInt(child.hadith_count)
            return (
              <Link
                key={child.id}
                href={`/topics/item/${child.id}`}
                className="group flex items-center justify-between bg-white rounded-lg border border-gray-100 px-5 py-3 hover:shadow-sm hover:border-green-200 transition-all"
              >
                <span className="text-green-900 group-hover:text-green-700 font-medium leading-relaxed">
                  {child.title}
                </span>
                <div className="flex items-center gap-3 shrink-0 mr-4">
                  {hadithCount > 0 && (
                    <span className="text-xs text-gray-400 bg-gray-50 rounded-full px-2 py-0.5">
                      {hadithCount.toLocaleString('ar-SA')} حديث
                    </span>
                  )}
                  {!child.is_leaf && (
                    <span className="text-xs text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                      فروع
                    </span>
                  )}
                  <span className="text-gray-300 group-hover:text-green-400 transition-colors">←</span>
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Hadiths (leaf node or direct links on a branch) */}
      {view === 'hadiths' && (
        <>
          {/* Grade distribution summary */}
          {gradeStats.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
              <div className="flex items-center gap-4 flex-wrap">
                {gradeStats.map(gs => {
                  const color = gs.grade_class === 'صحيح'
                    ? 'text-green-700 bg-green-50 border-green-200'
                    : gs.grade_class === 'حسن'
                    ? 'text-amber-700 bg-amber-50 border-amber-200'
                    : gs.grade_class === 'ضعيف'
                    ? 'text-red-600 bg-red-50 border-red-200'
                    : 'text-gray-600 bg-gray-50 border-gray-200'
                  return (
                    <span key={gs.grade_class} className={`text-xs font-semibold px-3 py-1 rounded-full border ${color}`}>
                      {gs.grade_class}: {gs.cnt.toLocaleString('ar-EG')}
                    </span>
                  )
                })}
                <span className="text-xs text-gray-400 mr-auto">من الأحاديث المحكوم عليها</span>
              </div>
              {topCompanions.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs text-gray-400 mb-2">أبرز الصحابة في هذا الموضوع:</p>
                  <div className="flex flex-wrap gap-2">
                    {topCompanions.map(c => (
                      <Link
                        key={c.id}
                        href={`/narrator/${c.id}`}
                        className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
                      >
                        {c.name.split('،')[0].trim()} ({c.cnt.toLocaleString('ar-EG')})
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Text search within topic */}
          <TopicSearchForm
            itemId={itemId}
            currentQuery={queryString.toString()}
            initialQuery={q}
          />

          {/* Grade filter */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {[
              { key: '', label: 'الكل', cls: !grade ? 'bg-green-900 text-white border-green-900' : 'bg-white text-gray-700 border-gray-200 hover:border-green-300' },
              { key: 'sahih', label: 'صحيح فقط', cls: grade === 'sahih' ? 'bg-green-700 text-white border-green-700' : 'bg-green-50 text-green-800 border-green-200 hover:bg-green-100' },
              { key: 'hasan', label: 'حسن فقط', cls: grade === 'hasan' ? 'bg-amber-600 text-white border-amber-600' : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100' },
              { key: 'daif', label: 'ضعيف فقط', cls: grade === 'daif' ? 'bg-red-600 text-white border-red-600' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
            ].map(g => (
              <Link
                key={g.key}
                href={topicGradeHref(g.key as SearchGrade)}
                aria-current={grade === g.key ? 'true' : undefined}
                className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${g.cls}`}
              >
                {g.label}
              </Link>
            ))}
            <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} نتيجة</span>
          </div>
          {hadiths.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-8 text-center text-gray-500">
              {grade ? 'لا توجد أحاديث بهذه الدرجة في هذا الموضوع' : 'لا توجد أحاديث مرتبطة بهذا الموضوع'}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {hadiths.map(h => (
                <Link
                  key={h.main_id}
                  href={`/hadith/${h.main_id}`}
                  className="group block bg-white rounded-xl border border-gray-100 p-5 hover:shadow-md hover:border-green-200 transition-all"
                >
                  {/* Book + location + grade */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-green-700 bg-green-50 rounded-full px-3 py-1">
                        {h.book_name}
                      </span>
                      {h.grade_hint && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          h.grade_hint === 'صحيح' ? 'bg-green-100 text-green-700' :
                          h.grade_hint === 'حسن' ? 'bg-amber-100 text-amber-700' :
                          h.grade_hint === 'ضعيف' ? 'bg-red-100 text-red-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {h.grade_hint}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <HadithNumber harf={h.tarqeem_harf} matboa={h.tarqeem_matboa1} />
                      {(h.part_num > 0 || h.page_num > 0) && (
                        <span className="text-xs text-gray-400">
                          ج{h.part_num} ص{h.page_num}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Section / Chapter context */}
                  {(h.section_text || h.chapter_text) && (
                    <p className="text-xs text-gray-400 mb-2 leading-relaxed">
                      {[h.section_text, h.chapter_text].filter(Boolean).join(' — ')}
                    </p>
                  )}

                  {/* Tarf (opening words) */}
                  {h.tarf ? (
                    <p className="text-gray-800 leading-loose text-base line-clamp-3">
                      {stripTags(h.tarf)}
                    </p>
                  ) : (
                    <p className="text-gray-400 italic text-sm">
                      (انقر لعرض الحديث)
                    </p>
                  )}

                  <MatnMatchLine parts={h.snippet} />

                  <div className="mt-3 flex justify-end">
                    <span className="text-xs text-green-600 group-hover:text-green-700 transition-colors">
                      عرض الحديث كاملاً ←
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-8">
          {page > 1 && (
            <Link
              href={topicHref({ page: page - 1 })}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 transition-colors"
            >
              → السابق
            </Link>
          )}
          <span className="text-sm text-gray-500 px-2">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link
              href={topicHref({ page: page + 1 })}
              className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-green-700 hover:bg-green-50 transition-colors"
            >
              ← التالي
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
