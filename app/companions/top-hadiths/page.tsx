import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أشهر أحاديث الصحابة — جامع خادم الحرمين' }

interface CompanionHadith {
  companion_id: number
  companion_name: string
  abb_name: string | null
  hadith_id: number
  tarf: string | null
  book_title: string
  attestation_count: number
  grade_hint: string | null
}

function stripTags(html: string) {
  return (html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function attestColor(cnt: number) {
  if (cnt >= 8) return 'bg-purple-100 text-purple-800'
  if (cnt >= 5) return 'bg-green-100 text-green-800'
  if (cnt >= 3) return 'bg-amber-100 text-amber-700'
  return 'bg-gray-100 text-gray-600'
}

function gradeClass(g: string | null) {
  if (g === 'صحيح') return 'bg-green-100 text-green-700'
  if (g === 'حسن') return 'bg-amber-100 text-amber-700'
  if (g === 'ضعيف') return 'bg-red-100 text-red-600'
  return ''
}

export default async function CompanionTopHadithsPage({
  searchParams,
}: {
  searchParams: Promise<{ min_hadith?: string; page?: string }>
}) {
  const sp = await searchParams
  const minHadith = Math.max(1, parseInt(sp.min_hadith || '50'))
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 40
  const offset = (pg - 1) * limit

  const [resultsRes, totalRes] = await Promise.all([
    pool.query<CompanionHadith>(
      `WITH hadith_counts AS (
         SELECT ic.narrator_id_array[1] AS companion_id,
                ih.hadith_id,
                COUNT(DISTINCT t.book_id)::int AS attestation_count
         FROM isnad_chains ic
         JOIN narrators comp ON comp.id = ic.narrator_id_array[1]
           AND comp.is_companion = true AND comp.hadiths_count >= $1
         JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
           AND ht.is_leaf = true AND ht.is_paragraph = true
         LEFT JOIN takhrij t ON t.hadith_id = ih.hadith_id
         GROUP BY ic.narrator_id_array[1], ih.hadith_id
       ),
       companion_best AS (
         SELECT DISTINCT ON (companion_id)
           companion_id, hadith_id, attestation_count
         FROM hadith_counts
         ORDER BY companion_id, attestation_count DESC
       )
       SELECT
         cb.companion_id, comp.name AS companion_name, comp.abb_name,
         cb.hadith_id, cb.attestation_count,
         regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
         b.title AS book_title,
         jg.grade_hint
       FROM companion_best cb
       JOIN narrators comp ON comp.id = cb.companion_id
       JOIN hadith_toc ht ON ht.main_id = cb.hadith_id
       JOIN books b ON b.id = ht.book_id
       LEFT JOIN LATERAL (
         SELECT CASE
           WHEN say_text ~* 'صحيح' THEN 'صحيح'
           WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
           WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
           ELSE NULL END AS grade_hint
         FROM hadith_judgments j2
         WHERE j2.hadith_id = cb.hadith_id
           AND (j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك')
         ORDER BY CASE WHEN j2.say_text ~* 'صحيح' THEN 1 WHEN j2.say_text ~* 'حسن' THEN 2 ELSE 3 END
         LIMIT 1
       ) jg ON true
       ORDER BY comp.hadiths_count DESC NULLS LAST
       LIMIT ${limit} OFFSET ${offset}`,
      [minHadith]
    ).catch(() => ({ rows: [] as CompanionHadith[] })),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(DISTINCT narrator_id_array[1])::int AS cnt
       FROM isnad_chains ic
       JOIN narrators comp ON comp.id = ic.narrator_id_array[1]
         AND comp.is_companion = true
         AND comp.hadiths_count >= $1`,
      [minHadith]
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const results = resultsRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('min_hadith', String(minHadith))
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/companions/top-hadiths?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-amber-900 mb-1">أشهر أحاديث الصحابة</h1>
        <p className="text-sm text-gray-500 mb-3">
          لكل صحابي أشهر حديث مروي عنه قياساً بعدد الكتب التي أوردته —
          يعكس الأثر التشريعي والتوثيقي لكل صحابي في المنظومة الحديثية
        </p>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للأحاديث:</span>
          {[10, 50, 100, 200, 500].map(n => (
            <Link key={n} href={buildUrl({ min_hadith: String(n) })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minHadith === n
                  ? 'bg-amber-800 text-white border-amber-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
              }`}>
              {n}+ حديث
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">{total.toLocaleString('ar-EG')} صحابي</span>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
        يعرض هذا الفهرس الحديث الأوسع انتشاراً لكل صحابي بمعيار تعدد الكتب التي أوردته.
        لا يعني التصدر أن الحديث الآخر أقل أهمية — فقد يكون أحاديث أخرى للصحابي في تراث تشريعي أعمق.
        مرتَّب تنازلياً بعدد أحاديث الصحابي في القاعدة.
      </div>

      <div className="space-y-3">
        {results.map((r, idx) => (
          <div key={r.companion_id} className="bg-white rounded-xl border border-gray-100 px-4 py-4 hover:shadow-sm hover:border-amber-200 transition-all">
            <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-300">{(offset + idx + 1).toLocaleString('ar-EG')}</span>
                <Link href={`/narrator/${r.companion_id}`}
                  className="font-bold text-amber-900 hover:underline text-sm">
                  {r.abb_name || r.companion_name}
                </Link>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.grade_hint && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${gradeClass(r.grade_hint)}`}>
                    {r.grade_hint}
                  </span>
                )}
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${attestColor(r.attestation_count)}`}>
                  {r.attestation_count} كتاب
                </span>
              </div>
            </div>

            <Link href={`/hadith/${r.hadith_id}`}
              className="block group">
              <p className="text-sm text-gray-700 leading-relaxed line-clamp-2 group-hover:text-indigo-800">
                {stripTags(r.tarf || '').slice(0, 250) || '...'}
              </p>
              <p className="text-xs text-gray-400 mt-1">{r.book_title}</p>
            </Link>
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
          {pg > 1 && (
            <Link href={buildUrl({ page: String(pg - 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-amber-800 hover:border-amber-300 text-sm">
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
                  p === pg ? 'bg-amber-800 text-white border-amber-800' : 'border-gray-200 bg-white text-amber-800 hover:border-amber-300'
                }`}>
                {p.toLocaleString('ar-EG')}
              </Link>
            )
          })}
          {pg < totalPages && (
            <Link href={buildUrl({ page: String(pg + 1) })}
              className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-amber-800 hover:border-amber-300 text-sm">
              التالي
            </Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-amber-700 hover:underline">← قائمة الصحابة</Link>
        <Link href="/hadiths/most-attested" className="text-amber-700 hover:underline">← الأوسع انتشاراً</Link>
        <Link href="/topics/companions" className="text-amber-700 hover:underline">← الصحابة × الموضوعات</Link>
      </div>
    </div>
  )
}
