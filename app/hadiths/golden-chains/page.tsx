import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الأسانيد الذهبية — جامع خادم الحرمين' }

interface ChainRow {
  hadith_id: number
  isnad_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_text: string | null
  chain_length: number
  narrator_names: string
  narrator_grades: string
}

const TIER_OPTIONS = [
  {
    key: 'thiqa_thabt',
    label: 'ثقة ثبت فأعلى',
    description: 'كل رواة السند من الثقات الأثبات',
    gradePattern: 'ثقة ثبت|ثقة حافظ|ثقة إمام|ثقة ثقة',
    color: 'bg-yellow-600 text-white',
    badgeColor: 'bg-yellow-100 text-yellow-800',
    cardBorder: 'border-yellow-300',
  },
  {
    key: 'thiqa',
    label: 'ثقة فأعلى',
    description: 'كل رواة السند موثَّقون',
    gradePattern: 'ثقة',
    color: 'bg-green-700 text-white',
    badgeColor: 'bg-green-100 text-green-800',
    cardBorder: 'border-green-200',
  },
]

export default async function GoldenChainsPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; min_len?: string; max_len?: string; page?: string }>
}) {
  const sp = await searchParams
  const tier = sp.tier || 'thiqa_thabt'
  const minLen = Math.max(2, parseInt(sp.min_len || '3'))
  const maxLen = Math.min(10, parseInt(sp.max_len || '7'))
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 20
  const offset = (page - 1) * limit

  const activeTier = TIER_OPTIONS.find(t => t.key === tier) || TIER_OPTIONS[0]

  // Counts for each tier (approximate — can be slow so cap with LIMIT in subquery)
  const tierCountsRes = await Promise.all(
    TIER_OPTIONS.map(t =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT ic.id)::int AS cnt
         FROM isnad_chains ic
         WHERE array_length(ic.narrator_id_array, 1) BETWEEN $2 AND $3
           AND NOT EXISTS (
             SELECT 1 FROM unnest(ic.narrator_id_array) AS nar_id
             JOIN narrators n ON n.id = nar_id
             WHERE NOT (n.is_companion = true OR n.martaba_ibn_hajar ~* $1)
           )`,
        [t.gradePattern, minLen, maxLen]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const [rowsRes, countRes] = await Promise.all([
    pool.query<ChainRow>(
      `SELECT DISTINCT ON (ih.hadith_id)
              ih.hadith_id,
              ic.id AS isnad_id,
              b.title AS book_name,
              b.takhrij_death AS book_death,
              ht.chapter_text AS chapter_name,
              LEFT(ht.tarf, 200) AS hadith_text,
              ic.chain_text,
              array_length(ic.narrator_id_array, 1) AS chain_length,
              (SELECT STRING_AGG(n2.abb_name || COALESCE(' [' || n2.martaba_ibn_hajar || ']', ''), ' → ' ORDER BY ord)
               FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nar_id, ord)
               JOIN narrators n2 ON n2.id = nar_id
               LIMIT 8) AS narrator_names,
              (SELECT STRING_AGG(COALESCE(n3.martaba_ibn_hajar, 'صحابي'), ', ' ORDER BY ord)
               FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nar_id, ord)
               JOIN narrators n3 ON n3.id = nar_id) AS narrator_grades
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE array_length(ic.narrator_id_array, 1) BETWEEN $2 AND $3
         AND NOT EXISTS (
           SELECT 1 FROM unnest(ic.narrator_id_array) AS nar_id
           JOIN narrators n ON n.id = nar_id
           WHERE NOT (n.is_companion = true OR n.martaba_ibn_hajar ~* $1)
         )
       ORDER BY ih.hadith_id, array_length(ic.narrator_id_array, 1) ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [activeTier.gradePattern, minLen, maxLen]
    ).catch(() => ({ rows: [] as ChainRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT ih.hadith_id)::int AS total
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE array_length(ic.narrator_id_array, 1) BETWEEN $2 AND $3
         AND NOT EXISTS (
           SELECT 1 FROM unnest(ic.narrator_id_array) AS nar_id
           JOIN narrators n ON n.id = nar_id
           WHERE NOT (n.is_companion = true OR n.martaba_ibn_hajar ~* $1)
         )`,
      [activeTier.gradePattern, minLen, maxLen]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('tier', tier)
    p.set('min_len', String(minLen))
    p.set('max_len', String(maxLen))
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/golden-chains?${p.toString()}`
  }

  function gradeLabel(g: string | null, isComp: boolean): string {
    if (isComp) return 'صحابي'
    if (!g) return '—'
    return g
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأسانيد الذهبية</h1>
        <p className="text-sm text-gray-500 mb-3">
          أسانيد كلُّ رواتها موثَّقون — لا يوجد فيها ضعيف أو مجهول أو غير موثَّق.
          أعلاها ما كان كل رجاله من الثقات الأثبات.
        </p>

        <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 mb-4 text-xs text-yellow-900">
          <span className="font-semibold">مفهوم السلسلة الذهبية: </span>
          أشهرها سلسلة مالك عن نافع عن ابن عمر، وسلسلة الزهري عن سالم عن ابن عمر.
          هذه الصفحة تكشف تلقائياً عن جميع الأسانيد التي استوفت شرط "عدم وجود ضعيف"
          بناءً على التوثيق المسجَّل في قاعدة البيانات.
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {TIER_OPTIONS.map((t, i) => (
            <Link key={t.key} href={buildUrl({ tier: t.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5 ${
                tier === t.key
                  ? `${t.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-yellow-300'
              }`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tier === t.key ? 'bg-white/20 text-white' : t.badgeColor
              }`}>
                {tierCountsRes[i]?.rows[0]?.cnt?.toLocaleString('ar-EG') || '...'}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">طول السند:</span>
          {[[3, 7], [3, 5], [4, 6], [5, 8]].map(([mn, mx]) => (
            <Link key={`${mn}-${mx}`}
              href={buildUrl({ min_len: String(mn), max_len: String(mx), page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minLen === mn && maxLen === mx
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {mn}–{mx} رواة
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
            className={`bg-white rounded-xl border p-4 hover:shadow-sm transition-all ${activeTier.cardBorder}`}>
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeTier.badgeColor}`}>
                    {activeTier.label}
                  </span>
                  <span className="text-xs text-gray-500">{r.book_name}</span>
                  {r.book_death && (
                    <span className="text-xs text-gray-400">ت {r.book_death}هـ</span>
                  )}
                  <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                    {r.chain_length} رواة
                  </span>
                </div>
                <div className="text-sm text-gray-800 leading-relaxed mb-2 line-clamp-2">
                  {r.hadith_text}{r.hadith_text?.length >= 200 ? '...' : ''}
                </div>
                {r.narrator_names && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-2 mb-2 leading-relaxed">
                    <span className="font-semibold text-amber-900">السند: </span>
                    {r.narrator_names}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-green-700 hover:underline font-medium">
                    الحديث الكامل ←
                  </Link>
                  <Link href={`/hadith/${r.hadith_id}/isnad-ranking`}
                    className="text-gray-400 hover:text-green-700">
                    جميع الأسانيد ←
                  </Link>
                  {r.chapter_name && (
                    <span className="text-gray-400 truncate max-w-[200px]">{r.chapter_name}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">
          لا توجد نتائج — جرب تغيير المعايير أو توسيع نطاق الطول
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-yellow-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-yellow-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/isnad-ranking" className="text-green-700 hover:underline">← ترتيب الأسانيد</Link>
        <Link href="/hadiths/shaykhayn-standard" className="text-green-700 hover:underline">← على شرط الشيخين</Link>
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
      </div>
    </div>
  )
}
