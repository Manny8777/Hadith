import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث متعددة المواضيع — جامع خادم الحرمين' }

interface CrossTopicHadith {
  main_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  topic_count: number
  topic_names: string | null
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function gradeClass(g: string | null) {
  if (g === 'صحيح') return 'bg-green-100 text-green-700'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700'
  if (g === 'ضعيف') return 'bg-red-100 text-red-600'
  return ''
}

export default async function CrossTopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_topics?: string; page?: string; cat_id?: string }>
}) {
  const sp = await searchParams
  const minTopics = Math.max(2, parseInt(sp.min_topics || '3'))
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const catId = sp.cat_id ? parseInt(sp.cat_id) : null
  const limit = 40
  const offset = (pg - 1) * limit

  // catClause for main query: catId is $4 ([minTopics, limit, offset, catId])
  const mainCatClause = catId
    ? `AND EXISTS (
         SELECT 1 FROM hadith_subjects hs2
         JOIN subject_items si2 ON si2.id = hs2.subject_id
         JOIN subject_categories sc ON sc.id = $4
         WHERE hs2.paragraph_main_id = ht.main_id
           AND si2.left_value > sc.left_value
           AND si2.right_value < sc.right_value
       )`
    : ''

  // catClause for count query: catId is $2 ([minTopics, catId])
  const countCatClause = catId
    ? `AND EXISTS (
         SELECT 1 FROM hadith_subjects hs2
         JOIN subject_items si2 ON si2.id = hs2.subject_id
         JOIN subject_categories sc ON sc.id = $2
         WHERE hs2.paragraph_main_id = ht.main_id
           AND si2.left_value > sc.left_value
           AND si2.right_value < sc.right_value
       )`
    : ''

  const mainParams: number[] = catId ? [minTopics, limit, offset, catId] : [minTopics, limit, offset]
  const countParams: number[] = catId ? [minTopics, catId] : [minTopics]

  const [hadithsRes, countRes, topCatsRes] = await Promise.all([
    pool.query<CrossTopicHadith>(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author,
              topics.topic_count, topics.topic_names,
              jg.grade_hint
       FROM (
         SELECT hs.paragraph_main_id,
                COUNT(DISTINCT hs.subject_id)::int AS topic_count,
                STRING_AGG(DISTINCT si.title, ' · ') FILTER (WHERE si.title IS NOT NULL) AS topic_names
         FROM hadith_subjects hs
         JOIN subject_items si ON si.id = hs.subject_id
         GROUP BY hs.paragraph_main_id
         HAVING COUNT(DISTINCT hs.subject_id) >= $1
       ) topics
       JOIN hadith_toc ht ON ht.main_id = topics.paragraph_main_id
       JOIN books b ON b.id = ht.book_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END AS grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = ht.main_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE WHEN j2.say_text ~* 'صحيح' THEN 1 WHEN j2.say_text ~* 'حسن' THEN 2 ELSE 3 END
         LIMIT 1
       ) jg ON true
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
         ${mainCatClause}
       ORDER BY topics.topic_count DESC, ht.main_id
       LIMIT $2 OFFSET $3`,
      mainParams
    ).catch(() => ({ rows: [] as CrossTopicHadith[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT hs.paragraph_main_id
         FROM hadith_subjects hs
         JOIN hadith_toc ht ON ht.main_id = hs.paragraph_main_id
         WHERE ht.is_leaf = true AND ht.is_paragraph = true
           ${countCatClause}
         GROUP BY hs.paragraph_main_id
         HAVING COUNT(DISTINCT hs.subject_id) >= $1
       ) sub`,
      countParams
    ).catch(() => ({ rows: [{ cnt: 0 }] })),

    pool.query<{ id: number; title: string }>(
      `SELECT id, title FROM subject_categories WHERE parent_id = 1 ORDER BY left_value LIMIT 20`
    ).catch(() => ({ rows: [] as { id: number; title: string }[] })),
  ])

  const hadiths = hadithsRes.rows
  const total = countRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)
  const topCats = topCatsRes.rows

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (minTopics !== 3) p.set('min_topics', String(minTopics))
    if (catId) p.set('cat_id', String(catId))
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    const str = p.toString()
    return `/hadiths/cross-topics${str ? '?' + str : ''}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث متعددة المواضيع</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث صُنِّفت تحت أكبر عدد من الموضوعات الفقهية والحديثية —
          تعكس أحاديث شاملة ذات أثر تشريعي وأخلاقي متعدد الأبعاد
        </p>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى من المواضيع:</span>
          {[2, 3, 4, 5, 6, 8].map(n => (
            <Link key={n} href={buildUrl({ min_topics: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minTopics === n
                  ? 'bg-green-900 text-white border-green-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ مواضيع
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">
            {total.toLocaleString('ar-EG')} حديث
          </span>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          <Link href={buildUrl({ cat_id: '' })}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              !catId ? 'bg-green-800 text-white border-green-800' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
            }`}>
            كل المواضيع
          </Link>
          {topCats.map(c => (
            <Link key={c.id} href={buildUrl({ cat_id: String(c.id) })}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                catId === c.id ? 'bg-amber-700 text-white border-amber-700' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}>
              {c.title}
            </Link>
          ))}
        </div>
      </div>

      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 mb-4 text-xs text-indigo-800">
        الأحاديث التي تظهر تحت مواضيع متعددة هي عادةً من الأحاديث الجامعة ذات المضامين التشريعية الشاملة،
        كحديث "الأعمال بالنيات" الذي يدخل في العبادات والمعاملات والنيات وغيرها.
        مفيد لمن يبحث في الأحاديث التأسيسية أو الجامعة في التراث الحديثي.
      </div>

      <div className="space-y-3">
        {hadiths.map((h, idx) => (
          <Link key={h.main_id} href={`/hadith/${h.main_id}`}
            className="block bg-white rounded-xl border border-gray-100 px-4 py-4 hover:shadow-md hover:border-indigo-200 transition-all group">
            <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                <span className="text-xs text-green-700 font-medium">{h.book_title}</span>
                {h.takhrij_author && (
                  <span className="text-xs text-gray-400">{h.takhrij_author}</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {h.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeClass(h.grade_hint)}`}>
                    {h.grade_hint}
                  </span>
                )}
                <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-indigo-100 text-indigo-800">
                  {h.topic_count} موضوع
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 mb-2 group-hover:text-indigo-900">
              {stripTags(h.tarf || '').slice(0, 220) || '...'}
            </p>

            {h.topic_names && (
              <div className="flex items-center gap-1.5 flex-wrap">
                {h.topic_names.split(' · ').slice(0, 5).map((t, ti) => (
                  <span key={ti} className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-full">
                    {t}
                  </span>
                ))}
                {h.topic_names.split(' · ').length > 5 && (
                  <span className="text-xs text-gray-400">
                    +{h.topic_names.split(' · ').length - 5} أخرى
                  </span>
                )}
              </div>
            )}
          </Link>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد أحاديث بهذا الشرط
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl({ page: String(pg - 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              السابق
            </Link>
          )}
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const start = Math.max(1, Math.min(pg - 2, totalPages - 4))
            const p = start + i
            if (p > totalPages) return null
            return (
              <Link key={p} href={buildUrl({ page: String(p) })}
                className={`px-3 py-2 rounded-lg border text-sm ${
                  p === pg ? 'bg-green-800 text-white border-green-800' : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl({ page: String(pg + 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/topics" className="text-green-700 hover:underline">← الفهارس الموضوعية</Link>
        <Link href="/topics/stats" className="text-green-700 hover:underline">← إحصاء الموضوعات</Link>
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
      </div>
    </div>
  )
}
