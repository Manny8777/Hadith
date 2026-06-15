import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أطراف على الأسانيد — جامع خادم الحرمين' }

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChainTypeCount {
  hadith_type: string
  chain_count: number
}

interface MatnProfileRow {
  chain_type: string
  cnt: number
  avg_len: number
}

interface SampleHadith {
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  matn_length: number | null
  is_story: boolean | null
}

interface TotalsRow {
  total_chains: number
  total_hadiths: number
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const ISNAD_TYPES = [
  {
    key: 'marfoa',
    label: 'مرفوع',
    desc: 'حديث مسند إلى النبي ﷺ',
    dbField: 'is_marfoa',
    color: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-900',
    badgeColor: 'bg-green-100 text-green-800',
    barColor: 'bg-green-600',
  },
  {
    key: 'mawkof',
    label: 'موقوف',
    desc: 'يقف عند الصحابي رضي الله عنه',
    dbField: 'is_mawkof',
    color: 'bg-amber-50',
    borderColor: 'border-amber-200',
    textColor: 'text-amber-900',
    badgeColor: 'bg-amber-100 text-amber-800',
    barColor: 'bg-amber-500',
  },
  {
    key: 'maktoa',
    label: 'مقطوع',
    desc: 'يقف عند التابعي أو من بعده',
    dbField: 'is_maktoa',
    color: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-900',
    badgeColor: 'bg-orange-100 text-orange-800',
    barColor: 'bg-orange-500',
  },
  {
    key: 'marfoa_hokm',
    label: 'مرفوع حكماً',
    desc: 'في حكم المرفوع وإن لم يُصرَّح بنسبته',
    dbField: 'is_marfoa_hokm',
    color: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-900',
    badgeColor: 'bg-blue-100 text-blue-800',
    barColor: 'bg-blue-500',
  },
] as const

type IsnadKey = (typeof ISNAD_TYPES)[number]['key']

// ─── Helpers ───────────────────────────────────────────────────────────────────

function stripTags(html: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function matnLengthLabel(len: number | null, isStory: boolean | null): string {
  if (isStory) return 'قصصي'
  if (len === null) return 'غير محدد'
  if (len > 200) return 'طويل'
  if (len <= 20) return 'قصير'
  return 'متوسط'
}

function matnLengthBadge(len: number | null, isStory: boolean | null): string {
  if (isStory) return 'bg-purple-100 text-purple-700'
  if (len === null) return 'bg-gray-100 text-gray-500'
  if (len > 200) return 'bg-red-100 text-red-700'
  if (len <= 20) return 'bg-green-100 text-green-700'
  return 'bg-blue-100 text-blue-700'
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default async function TarfsByIsnadPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const sp = await searchParams
  const activeKey = (sp.type as IsnadKey) || 'marfoa'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const activeType = ISNAD_TYPES.find(t => t.key === activeKey) || ISNAD_TYPES[0]

  // ── 1. Global totals ──────────────────────────────────────────────────────
  const totalsRes = await pool
    .query<TotalsRow>(
      `SELECT
         COUNT(*)::int AS total_chains,
         COUNT(DISTINCT rawy_id)::int AS total_hadiths
       FROM isnad_tree
       WHERE rawy_id IS NOT NULL`
    )
    .catch(() => ({ rows: [{ total_chains: 0, total_hadiths: 0 }] }))

  const totals = totalsRes.rows[0] || { total_chains: 0, total_hadiths: 0 }

  // ── 2. Chain counts per isnad type (from isnad_tree) ─────────────────────
  const chainCountsRes = await pool
    .query<ChainTypeCount>(
      `SELECT
         CASE
           WHEN is_marfoa      THEN 'مرفوع'
           WHEN is_mawkof      THEN 'موقوف'
           WHEN is_maktoa      THEN 'مقطوع'
           WHEN is_marfoa_hokm THEN 'مرفوع حكماً'
           ELSE 'غير محدد'
         END AS hadith_type,
         COUNT(DISTINCT id)::int AS chain_count
       FROM isnad_tree
       GROUP BY 1
       ORDER BY chain_count DESC`
    )
    .catch(() => ({ rows: [] as ChainTypeCount[] }))

  const chainCounts = chainCountsRes.rows

  // ── 3. Matn profile via takhrij (length / story breakdown) ───────────────
  const matnProfileRes = await pool
    .query<MatnProfileRow>(
      `SELECT
         CASE
           WHEN t.is_story = true    THEN 'قصصي'
           WHEN t.matn_length > 200  THEN 'طويل'
           WHEN t.matn_length <= 20  THEN 'قصير'
           ELSE 'متوسط'
         END AS chain_type,
         COUNT(*)::int AS cnt,
         ROUND(AVG(t.matn_length))::int AS avg_len
       FROM takhrij t
       WHERE t.matn_length IS NOT NULL
       GROUP BY 1
       ORDER BY cnt DESC`
    )
    .catch(() => ({ rows: [] as MatnProfileRow[] }))

  const matnProfile = matnProfileRes.rows
  const maxMatnCount = matnProfile.reduce((m, r) => Math.max(m, r.cnt), 1)

  // ── 4. Count + sample hadiths for the active isnad type ───────────────────
  // isnad_tree.rawy_id references a narrator (rawy); we join to hadith_toc
  // through the takhrij table (takhrij.pivot_rawy / pivot_id are narrator refs).
  // If the join is unavailable, fall back gracefully.

  const [sampleRes, sampleCountRes] = await Promise.all([
    pool
      .query<SampleHadith>(
        `SELECT DISTINCT ON (ht.main_id)
                ht.main_id AS hadith_id,
                regexp_replace(COALESCE(ht.tarf, ''), '<[^>]+>', ' ', 'g') AS tarf,
                b.title AS book_title,
                b.takhrij_author,
                tk.matn_length,
                tk.is_story
         FROM isnad_tree it
         JOIN takhrij tk ON tk.pivot_rawy = it.rawy_id
         JOIN hadith_toc ht ON ht.main_id = tk.hadith_id
           AND ht.is_leaf = true
           AND ht.is_paragraph = true
         JOIN books b ON b.id = ht.book_id
         WHERE it.${activeType.dbField} = true
           AND it.rawy_id IS NOT NULL
         ORDER BY ht.main_id
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      )
      .catch(() => ({ rows: [] as SampleHadith[] })),

    pool
      .query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT ht.main_id)::int AS cnt
         FROM isnad_tree it
         JOIN takhrij tk ON tk.pivot_rawy = it.rawy_id
         JOIN hadith_toc ht ON ht.main_id = tk.hadith_id
           AND ht.is_leaf = true
           AND ht.is_paragraph = true
         WHERE it.${activeType.dbField} = true
           AND it.rawy_id IS NOT NULL`
      )
      .catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const sampleHadiths = sampleRes.rows
  const sampleTotal = sampleCountRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(sampleTotal / pageSize)

  // Fallback: if pivot join yields nothing, try sand_rawy
  const [sampleResFallback, sampleCountResFallback] = sampleHadiths.length === 0
    ? await Promise.all([
        pool
          .query<SampleHadith>(
            `SELECT DISTINCT ON (ht.main_id)
                    ht.main_id AS hadith_id,
                    regexp_replace(COALESCE(ht.tarf, ''), '<[^>]+>', ' ', 'g') AS tarf,
                    b.title AS book_title,
                    b.takhrij_author,
                    tk.matn_length,
                    tk.is_story
             FROM isnad_tree it
             JOIN takhrij tk ON tk.sand_rawy = it.rawy_id
             JOIN hadith_toc ht ON ht.main_id = tk.hadith_id
               AND ht.is_leaf = true
               AND ht.is_paragraph = true
             JOIN books b ON b.id = ht.book_id
             WHERE it.${activeType.dbField} = true
               AND it.rawy_id IS NOT NULL
             ORDER BY ht.main_id
             LIMIT $1 OFFSET $2`,
            [pageSize, offset]
          )
          .catch(() => ({ rows: [] as SampleHadith[] })),

        pool
          .query<{ cnt: number }>(
            `SELECT COUNT(DISTINCT ht.main_id)::int AS cnt
             FROM isnad_tree it
             JOIN takhrij tk ON tk.sand_rawy = it.rawy_id
             JOIN hadith_toc ht ON ht.main_id = tk.hadith_id
               AND ht.is_leaf = true
               AND ht.is_paragraph = true
             WHERE it.${activeType.dbField} = true
               AND it.rawy_id IS NOT NULL`
          )
          .catch(() => ({ rows: [{ cnt: 0 }] })),
      ])
    : [null, null]

  const finalHadiths = sampleHadiths.length > 0
    ? sampleHadiths
    : (sampleResFallback?.rows || [])

  const finalTotal = sampleHadiths.length > 0
    ? sampleTotal
    : (sampleCountResFallback?.rows[0]?.cnt || 0)

  const finalTotalPages = Math.ceil(finalTotal / pageSize)
  const joinWorked = finalHadiths.length > 0

  // ── 5. Get chain count for active type from chainCounts ───────────────────
  const labelMap: Record<IsnadKey, string> = {
    marfoa: 'مرفوع',
    mawkof: 'موقوف',
    maktoa: 'مقطوع',
    marfoa_hokm: 'مرفوع حكماً',
  }

  function getChainCount(key: IsnadKey): number {
    return chainCounts.find(c => c.hadith_type === labelMap[key])?.chain_count || 0
  }

  const totalIsnadTreeChains = chainCounts
    .filter(c => c.hadith_type !== 'غير محدد')
    .reduce((s, c) => s + c.chain_count, 0)

  const unclassifiedCount =
    chainCounts.find(c => c.hadith_type === 'غير محدد')?.chain_count || 0

  function buildUrl(overrides: Record<string, string>): string {
    const p = new URLSearchParams()
    p.set('type', activeKey)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/tarfs-by-isnad?${p.toString()}`
  }

  return (
    <div dir="rtl">
      {/* ── Header ── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أطراف على الأسانيد</h1>
        <p className="text-sm text-gray-500 mb-3">
          تصفح أطراف الأحاديث مُنظَّمةً بحسب نوع إسنادها — مرفوع أو موقوف أو مقطوع أو مرفوع حكماً —
          بدلاً من الترتيب الأبجدي المعتاد
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 text-xs text-green-900">
          <span className="font-semibold">منهج الصفحة: </span>
          يُستخرج نوع الإسناد من تصنيف أعلام الأسانيد في شجرة الإسناد (
          <span className="font-bold">isnad_tree</span>)،
          حيث تُحدَّد خصائص كل إسناد بدلالة الوصف إلى النبي ﷺ أو الوقف عند الصحابي أو التابعي.
        </div>
      </div>

      {/* ── 4 Type tabs ── */}
      <div className="grid grid-cols-2 gap-2 mb-5 sm:grid-cols-4">
        {ISNAD_TYPES.map(t => {
          const count = getChainCount(t.key)
          const isActive = activeKey === t.key
          return (
            <Link
              key={t.key}
              href={buildUrl({ type: t.key, page: '1' })}
              className={`rounded-xl border p-3 transition-all hover:shadow-sm ${
                isActive
                  ? `${t.color} ${t.borderColor} shadow-sm`
                  : 'bg-white border-gray-100 hover:border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className={`text-sm font-bold ${isActive ? t.textColor : 'text-gray-700'}`}>
                  {t.label}
                </span>
                {count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                    isActive ? t.badgeColor : 'bg-gray-100 text-gray-500'
                  }`}>
                    {count.toLocaleString('ar-EG')} سند
                  </span>
                )}
              </div>
              <p className={`text-xs leading-relaxed ${isActive ? t.textColor : 'text-gray-400'}`}>
                {t.desc}
              </p>
            </Link>
          )
        })}
      </div>

      {/* ── Definitions box for active type ── */}
      <div className={`rounded-xl border px-4 py-3 mb-4 ${activeType.color} ${activeType.borderColor}`}>
        <div className="flex items-start gap-3">
          <span className={`text-base font-bold ${activeType.textColor} shrink-0`}>
            {activeType.label}
          </span>
          <p className="text-sm text-gray-700 leading-relaxed">
            {activeKey === 'marfoa' &&
              'ما أُسنِد إلى النبي ﷺ قولاً أو فعلاً أو تقريراً أو صفةً — وهو أعلى مراتب الحديث النبوي وأكثرها تشريعيةً.'}
            {activeKey === 'mawkof' &&
              'ما رُوي عن الصحابي رضي الله عنه ولم يرفعه إلى النبي ﷺ — وقد يكون له حكم الرفع إذا كان مما لا مجال فيه للاجتهاد.'}
            {activeKey === 'maktoa' &&
              'ما رُوي عن التابعي أو من بعده من أتباع التابعين قولاً أو فعلاً — ولا يُعدُّ حديثاً مرفوعاً ولا له قوته في الإلزام.'}
            {activeKey === 'marfoa_hokm' &&
              'ما في حكم المرفوع وإن لم يُصرَّح بنسبته إلى النبي ﷺ — كقول الصحابي "أُمرنا بكذا" أو "نُهينا عن كذا" وما لا مجال للرأي فيه.'}
          </p>
        </div>
      </div>

      {/* ── Chain count summary row ── */}
      {chainCounts.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
          <p className="text-xs text-gray-500 mb-3 font-medium">
            توزيع الأسانيد حسب النوع — إجمالي: {totalIsnadTreeChains.toLocaleString('ar-EG')} سند مُصنَّف
          </p>
          <div className="space-y-2.5">
            {ISNAD_TYPES.map(t => {
              const count = getChainCount(t.key)
              const pct = totalIsnadTreeChains > 0
                ? Math.round((count / totalIsnadTreeChains) * 100)
                : 0
              return (
                <div key={t.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 shrink-0">{t.label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                    <div
                      className={`h-3.5 rounded-full transition-all ${t.barColor}`}
                      style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-gray-700 w-16 text-left tabular-nums">
                    {count.toLocaleString('ar-EG')}
                  </span>
                  <span className="text-xs text-gray-400 w-10 text-left tabular-nums">
                    {pct}%
                  </span>
                </div>
              )
            })}
            {unclassifiedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 w-24 shrink-0">غير محدد</span>
                <div className="flex-1 bg-gray-100 rounded-full h-3.5 overflow-hidden">
                  <div
                    className="h-3.5 rounded-full bg-gray-300"
                    style={{
                      width: `${Math.max(
                        Math.round((unclassifiedCount / (totalIsnadTreeChains + unclassifiedCount)) * 100),
                        1
                      )}%`,
                    }}
                  />
                </div>
                <span className="text-xs font-medium text-gray-400 w-16 text-left tabular-nums">
                  {unclassifiedCount.toLocaleString('ar-EG')}
                </span>
                <span className="text-xs text-gray-300 w-10 text-left" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Matn length / type profile ── */}
      {matnProfile.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <p className="text-xs text-gray-500 mb-3 font-medium">
            توزيع الأحاديث بطول المتن وطبيعته (من جدول التخريج)
          </p>
          <div className="flex items-end gap-3 flex-wrap">
            {matnProfile.map(row => {
              const barH = Math.round((row.cnt / maxMatnCount) * 80)
              const color =
                row.chain_type === 'قصير'
                  ? 'bg-green-400'
                  : row.chain_type === 'طويل'
                  ? 'bg-red-400'
                  : row.chain_type === 'قصصي'
                  ? 'bg-purple-400'
                  : 'bg-blue-400'
              return (
                <div key={row.chain_type} className="flex flex-col items-center gap-1">
                  <span className="text-xs text-gray-500 tabular-nums">
                    {row.cnt.toLocaleString('ar-EG')}
                  </span>
                  <div
                    className={`w-12 rounded-t-lg ${color} opacity-80`}
                    style={{ height: `${Math.max(barH, 4)}px` }}
                  />
                  <span className="text-xs font-medium text-gray-600">{row.chain_type}</span>
                  <span className="text-xs text-gray-400">
                    متوسط {Number(row.avg_len).toLocaleString('ar-EG')} حرف
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Hadiths for active type ── */}
      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
        <h2 className={`text-base font-bold ${activeType.textColor}`}>
          أحاديث {activeType.label}
          {finalTotal > 0 && (
            <span className="text-sm font-normal text-gray-500 mr-2">
              ({finalTotal.toLocaleString('ar-EG')} حديث)
            </span>
          )}
        </h2>
        {finalTotalPages > 1 && (
          <span className="text-xs text-gray-400">
            صفحة {page.toLocaleString('ar-EG')} من {finalTotalPages.toLocaleString('ar-EG')}
          </span>
        )}
      </div>

      {joinWorked ? (
        <>
          <div className="space-y-2.5 mb-5">
            {finalHadiths.map((h, idx) => (
              <Link
                key={h.hadith_id}
                href={`/hadith/${h.hadith_id}`}
                className={`flex items-start gap-3 rounded-xl border p-3.5 hover:shadow-sm transition-all group ${activeType.color} ${activeType.borderColor}`}
              >
                <span className="text-xs text-gray-400 shrink-0 w-6 pt-0.5">
                  {(offset + idx + 1).toLocaleString('ar-EG')}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeType.badgeColor}`}>
                      {activeType.label}
                    </span>
                    <span className="text-xs text-gray-600">{h.book_title}</span>
                    {h.takhrij_author && (
                      <span className="text-xs text-gray-400">{h.takhrij_author}</span>
                    )}
                    {(h.matn_length !== null || h.is_story) && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${matnLengthBadge(
                          h.matn_length,
                          h.is_story
                        )}`}
                      >
                        {matnLengthLabel(h.matn_length, h.is_story)}
                        {h.matn_length ? ` (${h.matn_length.toLocaleString('ar-EG')} ح)` : ''}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm leading-relaxed line-clamp-2 ${activeType.textColor} group-hover:opacity-80`}>
                    {stripTags(h.tarf).slice(0, 240) || `حديث رقم ${h.hadith_id}`}
                  </p>
                  <div className="mt-1.5 text-xs text-green-700 group-hover:underline">
                    تفاصيل الحديث ←
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {finalTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
              {page > 1 && (
                <Link
                  href={buildUrl({ page: String(page - 1) })}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-green-300"
                >
                  ← السابق
                </Link>
              )}
              <span className="text-xs text-gray-500">
                {page.toLocaleString('ar-EG')} / {finalTotalPages.toLocaleString('ar-EG')}
              </span>
              {page < finalTotalPages && (
                <Link
                  href={buildUrl({ page: String(page + 1) })}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:border-green-300"
                >
                  التالي →
                </Link>
              )}
            </div>
          )}
        </>
      ) : (
        <div className={`rounded-xl border p-6 ${activeType.color} ${activeType.borderColor}`}>
          <p className={`text-sm font-semibold mb-2 ${activeType.textColor}`}>
            {activeType.label} — {getChainCount(activeKey).toLocaleString('ar-EG')} سند مُسجَّل
          </p>
          <p className="text-xs text-gray-600 leading-relaxed mb-3">
            يوجد في قاعدة البيانات{' '}
            <span className="font-bold text-gray-800">
              {getChainCount(activeKey).toLocaleString('ar-EG')}
            </span>{' '}
            سنداً مُصنَّفاً بنوع "{activeType.label}" في شجرة الأسانيد.
            تصفح الأحاديث المرتبطة بهذا النوع متاح عبر صفحات الحديث المفردة.
          </p>
          <p className="text-xs text-gray-400">
            قيد التطوير: ربط الأطراف مباشرةً بشجرة الأسانيد يستلزم مطابقة دقيقة بين الرواة.
          </p>
        </div>
      )}

      {/* ── Footer totals note ── */}
      <div className="mt-6 bg-gray-50 border border-gray-100 rounded-xl p-4 text-xs text-gray-500">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-semibold text-gray-700">إجمالي الأسانيد المرصودة:</span>
          <span className="font-bold text-green-800 text-sm">
            {(totals.total_chains || totalIsnadTreeChains + unclassifiedCount).toLocaleString('ar-EG')}
          </span>
          <span>سند حديثي في قاعدة البيانات</span>
        </div>
        <p className="mt-1.5 leading-relaxed">
          يتم البحث في أكثر من{' '}
          <span className="font-bold text-green-800">
            {(totals.total_chains || totalIsnadTreeChains + unclassifiedCount).toLocaleString('ar-EG')}
          </span>{' '}
          سند حديثي — التصنيف بناءً على بيانات شجرة الأسانيد (isnad_tree) المُدخَلة في قاعدة البيانات.
          قد يكون لبعض الأسانيد تصنيفات متعددة في الوقت ذاته (مرفوع وموقوف في روايتين مختلفتين).
        </p>
      </div>

      {/* ── Related links ── */}
      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/mawquf" className="text-green-700 hover:underline">
          ← الموقوف والمقطوع (من أحكام العلماء)
        </Link>
        <Link href="/hadiths/golden-chains" className="text-green-700 hover:underline">
          ← الأسانيد الذهبية
        </Link>
        <Link href="/hadiths/tarf-index" className="text-green-700 hover:underline">
          ← فهرس الأطراف الأبجدي
        </Link>
        <Link href="/chains" className="text-green-700 hover:underline">
          ← علو الإسناد
        </Link>
      </div>
    </div>
  )
}
