import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'المطعون فيهم بالجرح الشديد — جامع خادم الحرمين' }

interface CritRow {
  id: number
  name: string
  abb_name: string | null
  tabaqa: string | null
  death_year: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  hadiths_count: number
  crit_count: number
  harshest_terms: string
}

const SEVERITY_TIERS = [
  {
    key: 'waddaa',
    label: 'الوضَّاعون',
    description: 'يضعون الحديث ويختلقونه',
    pattern: 'وضاع|يضع الحديث|يفتري|وضع أحاديث|كان يضع',
    color: 'border-red-600 bg-red-900 text-white',
    badgeColor: 'bg-red-100 text-red-800',
    barColor: 'bg-red-600',
  },
  {
    key: 'kadhdhab',
    label: 'الكذَّابون',
    description: 'متهمون بالكذب في الحديث',
    pattern: 'كذاب|يكذب|كذب عليه|متهم بالكذب|اتُّهم بالوضع',
    color: 'border-red-400 bg-red-800 text-white',
    badgeColor: 'bg-red-100 text-red-700',
    barColor: 'bg-red-500',
  },
  {
    key: 'matruk',
    label: 'المتروكون',
    description: 'تُرك حديثهم بسبب الضعف الشديد',
    pattern: 'متروك الحديث|تُرك|متروك|يترك حديثه',
    color: 'border-orange-500 bg-orange-800 text-white',
    badgeColor: 'bg-orange-100 text-orange-700',
    barColor: 'bg-orange-500',
  },
  {
    key: 'munkar',
    label: 'المناكير',
    description: 'في حديثهم ما أُنكر على المحدثين',
    pattern: 'منكر الحديث|يروي المناكير|كثير المناكير|روى مناكير',
    color: 'border-amber-500 bg-amber-700 text-white',
    badgeColor: 'bg-amber-100 text-amber-700',
    barColor: 'bg-amber-500',
  },
  {
    key: 'wahin',
    label: 'شديدو الضعف',
    description: 'ضعفهم شديد وبالغ',
    pattern: 'ضعيف جداً|شديد الضعف|واهٍ|واهٍ جداً|لا يُحتج به|مطروح',
    color: 'border-yellow-600 bg-yellow-700 text-white',
    badgeColor: 'bg-yellow-100 text-yellow-800',
    barColor: 'bg-yellow-500',
  },
]

export default async function SeverelyCriticizedPage({
  searchParams,
}: {
  searchParams: Promise<{ tier?: string; sort?: string; page?: string }>
}) {
  const sp = await searchParams
  const tier = sp.tier || 'matruk'
  const sort = sp.sort || 'hadiths'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const activeTier = SEVERITY_TIERS.find(t => t.key === tier) || SEVERITY_TIERS[2]

  const orderBy =
    sort === 'crit_count' ? 'crit_count DESC, n.hadiths_count DESC' :
    sort === 'death' ? 'n.death_year_num ASC NULLS LAST' :
    'n.hadiths_count DESC, crit_count DESC'

  // Count for each tier (fast approximate)
  const tierCountsRes = await Promise.all(
    SEVERITY_TIERS.map(t =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT narrator_id)::int AS cnt FROM narrator_criticism WHERE say_text ~* $1`,
        [t.pattern]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const [rowsRes, countRes] = await Promise.all([
    pool.query<CritRow>(
      `SELECT DISTINCT ON (n.id)
              n.id, n.name, n.abb_name, n.tabaqa, n.death_year, n.death_year_num,
              n.martaba_ibn_hajar, n.hadiths_count,
              (SELECT COUNT(*)::int FROM narrator_criticism nc2
               WHERE nc2.narrator_id = n.id AND nc2.say_text ~* $1) AS crit_count,
              (SELECT STRING_AGG(DISTINCT nc3.say_text, ' | ')
               FROM narrator_criticism nc3
               WHERE nc3.narrator_id = n.id AND nc3.say_text ~* $1
               LIMIT 3) AS harshest_terms
       FROM narrator_criticism nc
       JOIN narrators n ON n.id = nc.narrator_id
       WHERE nc.say_text ~* $1
         AND n.is_companion = false
       ORDER BY n.id, n.hadiths_count DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [activeTier.pattern]
    ).then(res => {
      res.rows.sort((a, b) =>
        sort === 'crit_count' ? (b.crit_count - a.crit_count) :
        sort === 'death' ? ((a.death_year_num || 9999) - (b.death_year_num || 9999)) :
        (b.hadiths_count - a.hadiths_count)
      )
      return res
    }).catch(() => ({ rows: [] as CritRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT narrator_id)::int AS total
       FROM narrator_criticism
       WHERE say_text ~* $1`,
      [activeTier.pattern]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('tier', tier)
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/severely-criticized?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">المطعون فيهم بالجرح الشديد</h1>
        <p className="text-sm text-gray-500 mb-3">
          الرواة الذين طعن فيهم العلماء بأشد مصطلحات الجرح — أساس علم الجرح والتعديل ومعرفة الموضوع من الضعيف
        </p>

        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-4 text-xs text-red-800">
          <span className="font-semibold">مصطلحات الجرح الشديد: </span>
          رتَّب العلماء مصطلحات الجرح إلى مراتب — الوضع والكذب أشدها، ثم المتروك، ثم المنكر، ثم الضعف الشديد.
          النتائج مستخرجة من نصوص أحكام العلماء في قاعدة البيانات.
        </div>

        {/* Tier selector */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {SEVERITY_TIERS.map((t, i) => (
            <Link key={t.key} href={buildUrl({ tier: t.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5 ${
                tier === t.key
                  ? `${t.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-red-300'
              }`}>
              {t.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                tier === t.key ? 'bg-white/20 text-white' : t.badgeColor
              }`}>
                {tierCountsRes[i]?.rows[0]?.cnt?.toLocaleString('ar-EG') || '—'}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'hadiths', label: 'عدد الأحاديث' },
            { key: 'crit_count', label: 'عدد الأحكام' },
            { key: 'death', label: 'تاريخ الوفاة' },
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

        <div className="text-xs text-gray-400 mb-3">
          {activeTier.label}: {total.toLocaleString('ar-EG')} راوٍ — صفحة {page} من {totalPages}
        </div>

        <div className="bg-gray-50 rounded-xl border border-gray-100 p-3 text-xs text-gray-600 mb-3">
          <span className="font-semibold">الكلمات المفتاحية للبحث: </span>
          {activeTier.pattern.replace(/\|/g, ' · ')}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.id}
            className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm hover:border-red-200 transition-all">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Link href={`/narrator/${r.id}`}
                    className="font-bold text-green-900 hover:underline text-sm">
                    {r.name}
                  </Link>
                  {r.abb_name && r.abb_name !== r.name && (
                    <span className="text-xs text-gray-400">({r.abb_name})</span>
                  )}
                  {r.tabaqa && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {r.tabaqa}
                    </span>
                  )}
                  {r.death_year && (
                    <span className="text-xs text-gray-400">ت {r.death_year}</span>
                  )}
                  {r.martaba_ibn_hajar && (
                    <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                      {r.martaba_ibn_hajar}
                    </span>
                  )}
                </div>
                {r.harshest_terms && (
                  <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-2.5 py-1.5 mb-2 line-clamp-2">
                    {r.harshest_terms.split(' | ')[0]}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <Link href={`/narrator/${r.id}/criticism-history`}
                    className="text-amber-700 hover:underline">
                    {r.crit_count} حكم عليه ←
                  </Link>
                  <span>{r.hadiths_count?.toLocaleString('ar-EG') || 0} حديث</span>
                </div>
              </div>
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
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-red-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/contested" className="text-green-700 hover:underline">← المختلف فيهم</Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">← مصطلحات الجرح</Link>
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← علل الحديث</Link>
        <Link href="/narrators/unrated" className="text-green-700 hover:underline">← غير المُقيَّمين</Link>
      </div>
    </div>
  )
}
