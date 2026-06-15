import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تصنيف الأحاديث بعدد الصحابة — جامع خادم الحرمين' }

interface HadithRow {
  hadith_id: number
  hadith_text: string
  takhrij_id: number | null
  companion_count: number
  companion_names: string
  chain_count: number
  best_judgment: string | null
}

type Tier = 'mutawatir' | 'mashhur' | 'aziz' | 'gharib'

const TIERS: { key: Tier; label: string; desc: string; min: number; max: number; color: string; textColor: string }[] = [
  { key: 'mutawatir', label: 'متواتر', desc: '10 صحابة فأكثر', min: 10, max: 9999, color: 'bg-emerald-100 border-emerald-300', textColor: 'text-emerald-900' },
  { key: 'mashhur',  label: 'مشهور',  desc: '3–9 صحابة',      min: 3,  max: 9,    color: 'bg-green-50 border-green-200',   textColor: 'text-green-900' },
  { key: 'aziz',    label: 'عزيز',    desc: 'صحابيان فقط',    min: 2,  max: 2,    color: 'bg-blue-50 border-blue-200',     textColor: 'text-blue-900' },
  { key: 'gharib',  label: 'غريب',    desc: 'صحابي واحد',     min: 1,  max: 1,    color: 'bg-amber-50 border-amber-200',   textColor: 'text-amber-900' },
]

export default async function CompanionCountPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: Tier; page?: string }>
}) {
  const sp = await searchParams
  const activeTier: Tier = (sp.tier as Tier) || 'mutawatir'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const tier = TIERS.find(t => t.key === activeTier) || TIERS[0]

  const [countsRes, hadithsRes] = await Promise.all([
    // Count how many takhrij_id groups fall in each tier
    Promise.all(TIERS.map(t =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(*)::int AS cnt FROM (
           SELECT COALESCE(ht.takhrij_id::text, ht.main_id::text) AS group_key,
                  COUNT(DISTINCT CASE WHEN n.is_companion = true THEN ic.narrator_id_array[1] END)::int AS comp_count
           FROM hadith_toc ht
           JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
           JOIN isnad_chains ic ON ic.id = ih.isnad_id
           JOIN narrators n ON n.id = ic.narrator_id_array[1]
           GROUP BY COALESCE(ht.takhrij_id::text, ht.main_id::text)
           HAVING COUNT(DISTINCT CASE WHEN n.is_companion = true THEN ic.narrator_id_array[1] END) BETWEEN $1 AND $2
         ) sub`,
        [t.min, t.max]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )),

    pool.query<HadithRow>(
      `SELECT
         MIN(ht.main_id)::int AS hadith_id,
         LEFT(MIN(ht.tarf), 300) AS hadith_text,
         ht.takhrij_id,
         COUNT(DISTINCT CASE WHEN n.is_companion = true THEN ic.narrator_id_array[1] END)::int AS companion_count,
         STRING_AGG(DISTINCT CASE WHEN n.is_companion = true THEN n.abb_name END, '، ' ORDER BY CASE WHEN n.is_companion = true THEN n.abb_name END)
           FILTER (WHERE n.is_companion = true) AS companion_names,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         (SELECT hj.say_text FROM hadith_judgments hj
          WHERE hj.hadith_id = MIN(ht.main_id) LIMIT 1) AS best_judgment
       FROM hadith_toc ht
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       JOIN narrators n ON n.id = ic.narrator_id_array[1]
       GROUP BY COALESCE(ht.takhrij_id::text, ht.main_id::text), ht.takhrij_id
       HAVING COUNT(DISTINCT CASE WHEN n.is_companion = true THEN ic.narrator_id_array[1] END) BETWEEN $1 AND $2
       ORDER BY companion_count DESC, chain_count DESC
       LIMIT $3 OFFSET $4`,
      [tier.min, tier.max, pageSize, offset]
    ).catch(() => ({ rows: [] as HadithRow[] })),
  ])

  const tierCounts = countsRes.map((r, i) => ({ ...TIERS[i], count: r.rows[0]?.cnt || 0 }))
  const hadiths = hadithsRes.rows

  function judgmentColor(text: string | null) {
    if (!text) return 'text-gray-400'
    if (/صحيح/.test(text)) return 'text-green-700'
    if (/حسن/.test(text)) return 'text-blue-700'
    if (/ضعيف/.test(text)) return 'text-red-600'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تصنيف الحديث بعدد الصحابة الرواة</h1>
        <p className="text-sm text-gray-500 mb-3">
          تصنيف الأحاديث إلى متواتر ومشهور وعزيز وغريب بحسب عدد الصحابة الذين رووه بحسب أسانيد قاعدة البيانات
        </p>
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
          <strong>ملاحظة منهجية:</strong> هذا التصنيف مبني على الأسانيد المتوفرة في قاعدة البيانات، ولا يعكس بالضرورة إجماع المحدثين على تواتر حديث معين. عدد الصحابة هنا هو عدد الصحابة في موضع أول السند.
        </div>
      </div>

      {/* Tier tabs */}
      <div className="flex flex-wrap gap-2 mb-5">
        {tierCounts.map(t => (
          <a key={t.key}
            href={`/hadiths/companion-count?tier=${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium transition-all
              ${activeTier === t.key
                ? `${t.color} ${t.textColor} shadow-sm`
                : 'bg-white border-gray-100 text-gray-500 hover:border-gray-200'}`}>
            <span className="font-bold">{t.label}</span>
            <span className="text-xs opacity-70">{t.desc}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full
              ${activeTier === t.key ? 'bg-white/60' : 'bg-gray-100'}`}>
              {t.count.toLocaleString('ar-EG')}
            </span>
          </a>
        ))}
      </div>

      {/* Active tier explanation */}
      <div className={`rounded-xl border px-4 py-3 mb-5 ${tier.color}`}>
        <div className="flex items-center gap-3">
          <span className={`text-lg font-bold ${tier.textColor}`}>{tier.label}</span>
          <span className="text-sm text-gray-600">
            {tier.key === 'mutawatir' && 'رواه 10 صحابة أو أكثر — أعلى درجات الثبوت من حيث عدد الطرق'}
            {tier.key === 'mashhur'   && 'رواه 3 إلى 9 صحابة — يُسمى المشهور أو المستفيض في اصطلاح المحدثين'}
            {tier.key === 'aziz'      && 'رواه صحابيان بالضبط — نادر الوقوع، وله مكانة خاصة في علم الحديث'}
            {tier.key === 'gharib'    && 'رواه صحابي واحد — أكثر الأحاديث، وقد يكون صحيحاً أو ضعيفاً بحسب الإسناد'}
          </span>
        </div>
      </div>

      {/* Hadith list */}
      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={h.hadith_id}
            className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-colors">
            <div className="flex items-start justify-between gap-3 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${tier.color} ${tier.textColor}`}>
                  {h.companion_count} صحابي
                </span>
                {h.best_judgment && (
                  <span className={`text-xs ${judgmentColor(h.best_judgment)}`}>
                    {h.best_judgment.slice(0, 40)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{h.chain_count} سند</span>
                <Link href={`/hadith/${h.hadith_id}`}
                  className="text-xs text-green-700 hover:underline">تفاصيل ←</Link>
                {h.takhrij_id && (
                  <Link href={`/hadith/${h.hadith_id}/across-books`}
                    className="text-xs text-blue-600 hover:underline">مقارنة ←</Link>
                )}
              </div>
            </div>

            <p className="text-sm text-gray-900 leading-relaxed mb-2 line-clamp-3">
              {h.hadith_text}
              {h.hadith_text?.length === 300 && '...'}
            </p>

            {h.companion_names && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400">الصحابة الرواة:</span>
                <div className="flex flex-wrap gap-1">
                  {h.companion_names.split('، ').map((name, i) => (
                    <span key={i} className="text-xs bg-amber-50 text-amber-800 px-2 py-0.5 rounded-full border border-amber-100">
                      {name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {hadiths.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
          لا توجد بيانات لهذا التصنيف في قاعدة البيانات
        </div>
      )}

      {/* Pagination */}
      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/companion-count?tier=${activeTier}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300 transition-colors">
              ← السابق
            </a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/companion-count?tier=${activeTier}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300 transition-colors">
              التالي →
            </a>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/in-all-six" className="text-green-700 hover:underline">← الجامعة للستة</Link>
        <Link href="/hadiths/most-attested" className="text-green-700 hover:underline">← الأوسع انتشاراً</Link>
        <Link href="/hadiths/chain-richness" className="text-green-700 hover:underline">← تعدد الأسانيد</Link>
      </div>
    </div>
  )
}
