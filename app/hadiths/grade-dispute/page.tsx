import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأحاديث المختلف في درجتها — جامع خادم الحرمين' }

interface DisputedRow {
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  sahih_cnt: number
  hasan_cnt: number
  daif_cnt: number
  judge_cnt: number
  sahih_judges: string | null
  daif_judges: string | null
  chain_count: number
}

export default async function GradeDisputePage({
  searchParams,
}: {
  searchParams: Promise<{ dispute_type?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const disputeType = sp.dispute_type || 'sahih_daif'
  const sort = sp.sort || 'judge_cnt'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 25
  const offset = (page - 1) * limit

  // HAVING conditions for each dispute type
  const havingClause =
    disputeType === 'sahih_daif'
      ? `HAVING SUM(CASE WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف|لا يصح' THEN 1 ELSE 0 END) >= 1
              AND SUM(CASE WHEN hj.say_text ~* 'ضعيف' AND hj.say_text !~* 'صحيح|ليس بضعيف|غير ضعيف' THEN 1 ELSE 0 END) >= 1`
    : disputeType === 'hasan_daif'
      ? `HAVING SUM(CASE WHEN hj.say_text ~* 'حسن|إسناده حسن' AND hj.say_text !~* 'ضعيف|لا يصح' THEN 1 ELSE 0 END) >= 1
              AND SUM(CASE WHEN hj.say_text ~* 'ضعيف' AND hj.say_text !~* 'صحيح|ليس بضعيف' THEN 1 ELSE 0 END) >= 1`
    : `HAVING SUM(CASE WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف' THEN 1 ELSE 0 END) >= 1
              AND SUM(CASE WHEN hj.say_text ~* 'حسن|إسناده حسن' AND hj.say_text !~* 'ضعيف|صحيح' THEN 1 ELSE 0 END) >= 1`

  const orderBy =
    sort === 'judge_cnt' ? 'judge_cnt DESC' :
    sort === 'daif_first' ? 'daif_cnt DESC, judge_cnt DESC' :
    'sahih_cnt DESC, judge_cnt DESC'

  const [rowsRes, countRes] = await Promise.all([
    pool.query<DisputedRow>(
      `SELECT hj.hadith_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author,
              SUM(CASE WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف|لا يصح' THEN 1 ELSE 0 END)::int AS sahih_cnt,
              SUM(CASE WHEN hj.say_text ~* 'حسن|إسناده حسن' AND hj.say_text !~* 'ضعيف|صحيح' THEN 1 ELSE 0 END)::int AS hasan_cnt,
              SUM(CASE WHEN hj.say_text ~* 'ضعيف' AND hj.say_text !~* 'صحيح|ليس بضعيف|غير ضعيف' THEN 1 ELSE 0 END)::int AS daif_cnt,
              COUNT(*)::int AS judge_cnt,
              STRING_AGG(DISTINCT CASE WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف' THEN n.abb_name END, '، ' ORDER BY CASE WHEN hj.say_text ~* 'صحيح' AND hj.say_text !~* 'ضعيف' THEN n.abb_name END) AS sahih_judges,
              STRING_AGG(DISTINCT CASE WHEN hj.say_text ~* 'ضعيف' AND hj.say_text !~* 'صحيح|ليس بضعيف' THEN n.abb_name END, '، ' ORDER BY CASE WHEN hj.say_text ~* 'ضعيف' AND hj.say_text !~* 'صحيح|ليس بضعيف' THEN n.abb_name END) AS daif_judges,
              (SELECT COUNT(DISTINCT ih2.isnad_id)::int FROM isnad_hadiths ih2 WHERE ih2.hadith_id = hj.hadith_id) AS chain_count
       FROM hadith_judgments hj
       LEFT JOIN narrators n ON n.id = hj.scientist_id
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       GROUP BY hj.hadith_id, ht.tarf, b.title, b.takhrij_author
       ${havingClause}
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      []
    ).catch(() => ({ rows: [] as DisputedRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM (
         SELECT hj.hadith_id
         FROM hadith_judgments hj
         GROUP BY hj.hadith_id
         ${havingClause}
       ) sub`,
      []
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('dispute_type', disputeType)
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/grade-dispute?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأحاديث المختلف في درجتها</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث صدرت بحقها أحكام متضاربة من العلماء — بعضهم صحَّحها وبعضهم ضعَّفها
        </p>

        <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 mb-4 text-xs text-purple-800">
          <span className="font-semibold">قيمة بحثية: </span>
          الخلاف في درجة الحديث يعكس تفاوتاً في منهج النقد بين العلماء — قد يكون سببه اختلافهم في تقييم راوٍ،
          أو في شرط الصحة، أو في مقدار الانقطاع. دراسة هذه الأحاديث يُعمِّق فهم مناهج النقاد.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">نوع الخلاف:</span>
          {[
            { key: 'sahih_daif', label: 'صحيح ← → ضعيف' },
            { key: 'hasan_daif', label: 'حسن ← → ضعيف' },
            { key: 'sahih_hasan', label: 'صحيح ← → حسن' },
          ].map(t => (
            <Link key={t.key} href={buildUrl({ dispute_type: t.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                disputeType === t.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {t.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'judge_cnt', label: 'عدد الأحكام' },
            { key: 'daif_first', label: 'الأكثر تضعيفاً' },
            { key: 'sahih_first', label: 'الأكثر تصحيحاً' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="text-xs text-gray-400">
          {total.toLocaleString('ar-EG')} حديث — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div key={r.hadith_id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-purple-200 transition-all">
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                <span className="text-xs text-gray-500">{r.book_title}</span>
                {r.takhrij_author && <span className="text-xs text-gray-400">{r.takhrij_author}</span>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                  {r.judge_cnt} أحكام
                </span>
                {r.chain_count > 1 && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                    {r.chain_count} أسانيد
                  </span>
                )}
                <Link href={`/hadith/${r.hadith_id}`}
                  className="text-xs text-green-700 hover:underline">عرض ←</Link>
              </div>
            </div>

            <p className="text-sm text-gray-800 leading-relaxed mb-3">
              {(r.tarf || '').slice(0, 200)}
              {(r.tarf?.length || 0) > 200 && <span className="text-gray-400">...</span>}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {r.sahih_cnt > 0 && (
                <div className="bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-bold text-green-700 mb-1">
                    صحَّحه ({r.sahih_cnt})
                  </div>
                  {r.sahih_judges && (
                    <div className="text-xs text-green-600">{r.sahih_judges.slice(0, 100)}</div>
                  )}
                </div>
              )}
              {r.hasan_cnt > 0 && (
                <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-bold text-blue-700 mb-1">
                    حسَّنه ({r.hasan_cnt})
                  </div>
                </div>
              )}
              {r.daif_cnt > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-bold text-red-700 mb-1">
                    ضعَّفه ({r.daif_cnt})
                  </div>
                  {r.daif_judges && (
                    <div className="text-xs text-red-600">{r.daif_judges.slice(0, 100)}</div>
                  )}
                </div>
              )}
            </div>

            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400 flex-wrap">
              <Link href={`/hadith/${r.hadith_id}/pivot`} className="hover:text-green-700">المدار ←</Link>
              <Link href={`/hadith/${r.hadith_id}/all-narrators`} className="hover:text-green-700">الرواة ←</Link>
              <Link href={`/hadith/${r.hadith_id}/witnesses`} className="hover:text-green-700">الشواهد ←</Link>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد نتائج</div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars/disagreements" className="text-green-700 hover:underline">← خلاف المحدثين</Link>
        <Link href="/hadiths/unjudged" className="text-green-700 hover:underline">← غير المحكوم</Link>
        <Link href="/hadiths/weak-supported" className="text-green-700 hover:underline">← الضعيف المعتضد</Link>
      </div>
    </div>
  )
}
