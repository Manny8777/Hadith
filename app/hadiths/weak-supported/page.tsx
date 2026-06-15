import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الضعيف المعتضد بالشواهد — جامع خادم الحرمين' }

interface WeakRow {
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  daif_judgment: string
  witness_count: number
  companion_count: number
  chain_count: number
  group_id: number
}

export default async function WeakSupportedPage({
  searchParams,
}: {
  searchParams: Promise<{ min_witnesses?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const minWitnesses = Math.max(2, parseInt(sp.min_witnesses || '3'))
  const sort = sp.sort || 'witnesses'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const orderBy =
    sort === 'companions' ? 'companion_count DESC, witness_count DESC' :
    sort === 'chains' ? 'chain_count DESC, witness_count DESC' :
    'witness_count DESC, companion_count DESC'

  const [rowsRes, countRes] = await Promise.all([
    pool.query<WeakRow>(
      `SELECT DISTINCT ON (hj.hadith_id)
              hj.hadith_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author,
              hj.say_text AS daif_judgment,
              t1.group_id,
              (
                SELECT COUNT(DISTINCT t2.hadith_id)::int
                FROM takhrij t2
                WHERE t2.group_id = t1.group_id AND t2.hadith_id != hj.hadith_id
              ) AS witness_count,
              (
                SELECT COUNT(DISTINCT ic2.narrator_id_array[1])::int
                FROM takhrij t2
                JOIN isnad_hadiths ih2 ON ih2.hadith_id = t2.hadith_id
                JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
                JOIN narrators comp ON comp.id = ic2.narrator_id_array[1] AND comp.is_companion = true
                WHERE t2.group_id = t1.group_id AND t2.hadith_id != hj.hadith_id
              ) AS companion_count,
              (
                SELECT COUNT(DISTINCT ih3.isnad_id)::int
                FROM isnad_hadiths ih3
                WHERE ih3.hadith_id = hj.hadith_id
              ) AS chain_count
       FROM hadith_judgments hj
       JOIN takhrij t1 ON t1.hadith_id = hj.hadith_id AND t1.group_id IS NOT NULL
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
       JOIN books b ON b.id = ht.book_id
       WHERE hj.say_text ~* 'ضعيف'
         AND hj.say_text !~* 'صحيح|حسن|ليس بضعيف|غير ضعيف'
         AND (
           SELECT COUNT(DISTINCT t2.hadith_id)::int
           FROM takhrij t2
           WHERE t2.group_id = t1.group_id AND t2.hadith_id != hj.hadith_id
         ) >= $1
       ORDER BY hj.hadith_id, hj.say_text
       LIMIT ${limit} OFFSET ${offset}`,
      [minWitnesses]
    ).then(r => {
      r.rows.sort((a, b) =>
        sort === 'companions' ? (b.companion_count - a.companion_count || b.witness_count - a.witness_count) :
        sort === 'chains' ? (b.chain_count - a.chain_count || b.witness_count - a.witness_count) :
        (b.witness_count - a.witness_count || b.companion_count - a.companion_count)
      )
      return r
    }).catch(() => ({ rows: [] as WeakRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT hj.hadith_id)::int AS total
       FROM hadith_judgments hj
       JOIN takhrij t1 ON t1.hadith_id = hj.hadith_id AND t1.group_id IS NOT NULL
       WHERE hj.say_text ~* 'ضعيف'
         AND hj.say_text !~* 'صحيح|حسن|ليس بضعيف|غير ضعيف'
         AND (
           SELECT COUNT(DISTINCT t2.hadith_id)::int
           FROM takhrij t2
           WHERE t2.group_id = t1.group_id AND t2.hadith_id != hj.hadith_id
         ) >= $1`,
      [minWitnesses]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_witnesses', String(minWitnesses))
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/weak-supported?${p.toString()}`
  }

  function supportStrength(companions: number, witnesses: number): { label: string; color: string } {
    if (companions >= 3) return { label: 'اعتضاد قوي', color: 'bg-green-100 text-green-700' }
    if (companions >= 2) return { label: 'اعتضاد متوسط', color: 'bg-blue-100 text-blue-700' }
    if (companions >= 1) return { label: 'اعتضاد بسيط', color: 'bg-amber-100 text-amber-700' }
    if (witnesses >= 5) return { label: 'متابعات متعددة', color: 'bg-indigo-100 text-indigo-700' }
    return { label: 'متابعة واحدة', color: 'bg-gray-100 text-gray-600' }
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الضعيف المعتضد بالشواهد</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث صدر بحقها حكم بالضعف ولها شواهد من طرق أخرى — قد تُرقَّى إلى "حسن لغيره" بتضافر الطرق
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-800">
          <span className="font-semibold">مفهوم "الحسن لغيره": </span>
          الحديث الضعيف إذا رُوي من طريق آخر مستقل ارتقى درجةً عند جمهور المحدثين من "ضعيف" إلى "حسن لغيره"
          بشرط أن لا يكون ضعفه شديداً (كذب أو فسق). وجود شاهد من صحابي آخر يُعدّ شاهداً أقوى من مجرد متابعة.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للشواهد:</span>
          {[2, 3, 5, 10, 20].map(n => (
            <Link key={n} href={buildUrl({ min_witnesses: String(n), page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minWitnesses === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ شاهد
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'witnesses', label: 'عدد الشواهد' },
            { key: 'companions', label: 'عدد الصحابة' },
            { key: 'chains', label: 'الأسانيد' },
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
        {rows.map((r, idx) => {
          const { label: supportLabel, color: supportColor } = supportStrength(r.companion_count, r.witness_count)
          return (
            <div key={r.hadith_id}
              className="bg-white rounded-xl border border-gray-100 p-4 hover:shadow-sm hover:border-green-200 transition-all">
              <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                  <Link href={`/books/${r.book_title}`}
                    className="text-xs text-gray-500">{r.book_title}</Link>
                  {r.takhrij_author && <span className="text-xs text-gray-400">{r.takhrij_author}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${supportColor}`}>
                    {supportLabel}
                  </span>
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-xs text-green-700 hover:underline">عرض ←</Link>
                </div>
              </div>

              <p className="text-sm text-gray-800 leading-relaxed mb-3">
                {(r.tarf || '').slice(0, 200)}
                {(r.tarf?.length || 0) > 200 && <span className="text-gray-400">...</span>}
              </p>

              <div className="bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 text-xs text-red-700 mb-2 line-clamp-1">
                <span className="font-semibold">الحكم: </span>{r.daif_judgment}
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Link href={`/hadith/${r.hadith_id}/witnesses`}
                  className="flex items-center gap-1.5 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1.5 rounded-lg hover:bg-indigo-100 transition-colors">
                  <span className="font-bold">{r.witness_count}</span>
                  <span>شاهد ومتابعة</span>
                </Link>
                {r.companion_count > 0 && (
                  <span className="flex items-center gap-1.5 text-xs bg-amber-50 text-amber-700 px-2.5 py-1.5 rounded-lg">
                    <span className="font-bold">{r.companion_count}</span>
                    <span>صحابي آخر</span>
                  </span>
                )}
                {r.chain_count > 1 && (
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1.5 rounded-lg">
                    {r.chain_count} أسانيد
                  </span>
                )}
                <Link href={`/hadith/${r.hadith_id}/pivot`}
                  className="text-xs text-gray-500 hover:text-green-700">
                  المدار →
                </Link>
              </div>
            </div>
          )
        })}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد نتائج</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400 transition-colors">
              ← السابق
            </Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400 transition-colors">
              التالي ←
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/unjudged" className="text-green-700 hover:underline">← غير المحكوم</Link>
        <Link href="/hadiths/chain-richness" className="text-green-700 hover:underline">← تعدد الأسانيد</Link>
        <Link href="/scholars" className="text-green-700 hover:underline">← أحكام المحدثين</Link>
      </div>
    </div>
  )
}
