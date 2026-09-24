import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'خدمات الحديث النبوي — جامع خادم الحرمين' }

interface TopHadith {
  hadith_id: number
  tarf_clean: string
  book_title: string
  service_count: number
}

interface CanonicalServiceType {
  id: number
  name: string
  column_key: string | null
}

type ServiceKey =
  | 'takhreg' | 'compound_matn' | 'rwah' | 'asnad' | 'shawahed'
  | 'ghareeb' | 'degree' | 'sharh' | 'subjects' | 'tafsser'
  | 'biography' | 'medicine' | 'feqh' | 'asbab' | 'mokhtalaf'
  | 'amthal' | 'motawater' | 'countries' | 'modrag' | 'kerat'
  | 'proper_name' | 'matn_comparison'

type ServiceGroup = 'blue' | 'green' | 'amber' | 'red'

const SERVICE_DEFINITIONS: Array<{
  key: ServiceKey
  fallbackName: string
  group: ServiceGroup
  desc: string
}> = [
  { key: 'takhreg', fallbackName: 'التخريج', group: 'blue', desc: 'تخريج الحديث وعزوه' },
  { key: 'compound_matn', fallbackName: 'تخريج الشروح', group: 'blue', desc: 'المتون الواردة في كتب التخريج' },
  { key: 'rwah', fallbackName: 'تخريج الرواة', group: 'blue', desc: 'الروايات الواردة في كتب التخريج' },
  { key: 'asnad', fallbackName: 'أصل', group: 'blue', desc: 'الأصل الإسنادي والروايات المرتبطة' },
  { key: 'shawahed', fallbackName: 'الشواهد والمتابعات', group: 'blue', desc: 'الطرق والشواهد الأخرى' },
  { key: 'ghareeb', fallbackName: 'غريب الحديث', group: 'green', desc: 'بيان الألفاظ الغريبة' },
  { key: 'degree', fallbackName: 'الدرجة', group: 'green', desc: 'حكم الحديث ودرجته' },
  { key: 'sharh', fallbackName: 'الشروح', group: 'green', desc: 'شرح ألفاظ الحديث ومعانيه' },
  { key: 'motawater', fallbackName: 'التواتر', group: 'green', desc: 'ما ورد مواتراً في السنن' },
  { key: 'subjects', fallbackName: 'الموضوعات', group: 'amber', desc: 'تصنيف الحديث موضوعياً' },
  { key: 'feqh', fallbackName: 'استدلال فقهي', group: 'amber', desc: 'الأحكام الفقهية المستنبطة' },
  { key: 'asbab', fallbackName: 'أسباب الورود', group: 'amber', desc: 'سياق وأسباب ورود الحديث' },
  { key: 'tafsser', fallbackName: 'تفسير بالمأثور', group: 'amber', desc: 'الآيات والتفسير المأثور المرتبط' },
  { key: 'amthal', fallbackName: 'أمثال الحديث', group: 'amber', desc: 'أمثال من الحديث النبوي' },
  { key: 'kerat', fallbackName: 'القراءات', group: 'amber', desc: 'قراءات الحديث وروابطها' },
  { key: 'biography', fallbackName: 'سيرة', group: 'red', desc: 'سيرة وتراجم رواة الحديث' },
  { key: 'mokhtalaf', fallbackName: 'مخالف', group: 'red', desc: 'توجيه الأحاديث المخالفة' },
  { key: 'medicine', fallbackName: 'الطب النبوي', group: 'red', desc: 'الجانب الطبي في الحديث' },
  { key: 'countries', fallbackName: 'الروايات بالبلدان', group: 'red', desc: 'انتقال الرواية بين البلدان' },
  { key: 'modrag', fallbackName: 'الإدراج', group: 'red', desc: 'ما أُدرج في متن الحديث' },
  { key: 'proper_name', fallbackName: 'أسماء الأعلام', group: 'red', desc: 'الأعلام المترجمة داخل الحديث' },
  { key: 'matn_comparison', fallbackName: 'مقارنة المتون', group: 'red', desc: 'سياقات المقارنة بين المتون' },
]

const SERVICE_KEYS = SERVICE_DEFINITIONS.map(service => service.key)

const GROUP_STYLES: Record<string, { card: string; bar: string; badge: string; label: string }> = {
  blue: {
    card: 'border-blue-100 bg-blue-50 hover:border-blue-300',
    bar: 'bg-blue-500',
    badge: 'bg-blue-100 text-blue-700',
    label: 'text-blue-800',
  },
  green: {
    card: 'border-emerald-100 bg-emerald-50 hover:border-emerald-300',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-100 text-emerald-700',
    label: 'text-emerald-800',
  },
  amber: {
    card: 'border-amber-100 bg-amber-50 hover:border-amber-300',
    bar: 'bg-amber-500',
    badge: 'bg-amber-100 text-amber-700',
    label: 'text-amber-800',
  },
  red: {
    card: 'border-rose-100 bg-rose-50 hover:border-rose-300',
    bar: 'bg-rose-500',
    badge: 'bg-rose-100 text-rose-700',
    label: 'text-rose-800',
  },
}

const GROUP_LABELS: Record<string, string> = {
  blue: 'علوم الإسناد',
  green: 'علوم المتن',
  amber: 'الخدمات الموضوعية',
  red: 'الخدمات النقدية',
}

function serviceBar(count: number, total: number, color: string) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="mt-2">
      <div className="w-full bg-white rounded-full h-1.5 overflow-hidden border border-white/60">
        <div className={`h-1.5 rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function serviceCount(n: number) {
  // colored badge for top hadiths
  if (n >= 12) return 'bg-purple-700 text-white'
  if (n >= 9)  return 'bg-green-700 text-white'
  if (n >= 6)  return 'bg-amber-600 text-white'
  return 'bg-gray-400 text-white'
}

export default async function ServicesIndexPage() {
  const statsColumns = SERVICE_KEYS
    .map(key => `COUNT(*) FILTER (WHERE ${key})::bigint AS "${key}"`)
    .join(',\n')
  const serviceExpression = SERVICE_KEYS
    .map(key => `COALESCE(hs.${key}::int, 0)`)
    .join(' + ')

  const [statsRes, topRes, typeRes] = await Promise.all([
    pool.query<Record<string, string>>(
      `SELECT
         ${statsColumns},
         COUNT(*)::bigint AS total
       FROM hadith_services`
    ).catch(() => ({ rows: [] as Record<string, string>[] })),

    pool.query<TopHadith>(
      `SELECT hs.hadith_id,
         regexp_replace(ht.tarf, '<[^>]+>', ' ', 'g') AS tarf_clean,
         b.title AS book_title,
         (${serviceExpression}) AS service_count
       FROM hadith_services hs
       JOIN hadith_toc ht ON ht.main_id = hs.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true
       ORDER BY service_count DESC
       LIMIT 10`
    ).catch(() => ({ rows: [] as TopHadith[] })),

    pool.query<CanonicalServiceType>(
      'SELECT id, name, column_key FROM hadith_service_types ORDER BY id'
    ).catch(() => ({ rows: [] as CanonicalServiceType[] })),
  ])

  const stats = statsRes.rows[0]
  const topHadiths = topRes.rows
  const canonicalTypes = typeRes.rows
  const canonicalNameByKey = new Map(
    canonicalTypes
      .filter(type => type.column_key)
      .map(type => [type.column_key as string, type.name])
  )
  const services = SERVICE_DEFINITIONS.map(definition => ({
    ...definition,
    name: canonicalNameByKey.get(definition.key) || definition.fallbackName,
    count: Number(stats?.[definition.key] || 0),
  }))
  const countMap = Object.fromEntries(services.map(service => [service.key, service.count]))
  const total = Number(stats?.total || 0)
  const groups: ServiceGroup[] = ['blue', 'green', 'amber', 'red']
  const totalServicesProvided = SERVICE_KEYS.reduce((sum, key) => sum + (countMap[key] || 0), 0)
  const avgServicesPerHadith = total > 0 ? (totalServicesProvided / total).toFixed(1) : '0'
  const sorted = [...services].sort((a, b) => b.count - a.count)
  const mostCovered = sorted[0]
  const leastCovered = sorted[sorted.length - 1]
  const unmappedCanonicalTypes = canonicalTypes.filter(type => !type.column_key)

  return (
    <div dir="rtl" className="min-h-screen bg-stone-50">
      {/* Header */}
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link href="/hadiths" className="text-amber-200 hover:text-white text-sm transition-colors">
            ← الأحاديث
          </Link>
          <div className="text-center">
            <h1 className="text-xl font-bold text-amber-100">خدمات الحديث النبوي</h1>
            <p className="text-xs text-green-200 mt-0.5">ما يتوفر لكل حديث من شروح وتخاريج وخدمات</p>
          </div>
          <Link href="/" className="text-amber-200 hover:text-white text-sm transition-colors">
            الرئيسية
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">

        {/* Summary strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
            <div className="text-3xl font-bold text-green-900">{total.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-1">إجمالي الأحاديث في قاعدة الخدمات</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
            <div className="text-3xl font-bold text-blue-700">{canonicalTypes.length.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-1">نوعاً أصلياً في جدول الخدمات</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
            <div className="text-3xl font-bold text-amber-700">{avgServicesPerHadith}</div>
            <div className="text-xs text-gray-500 mt-1">متوسط الخدمات لكل حديث</div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
            <div className="text-3xl font-bold text-purple-700">{totalServicesProvided.toLocaleString('ar-EG')}</div>
            <div className="text-xs text-gray-500 mt-1">مجموع الخدمات المتاحة</div>
          </div>
        </div>

        <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-6 text-blue-900">
          يوجد {services.length.toLocaleString('ar-EG')} مؤشراً قابلاً للقياس في جدول
          <span dir="ltr" className="mx-1 font-mono">hadith_services</span>.
          الأسماء القابلة للقياس مأخوذة من جدول الأنواع الأصلي، لا من قائمة ثابتة.
          {unmappedCanonicalTypes.length > 0 && (
            <div className="mt-1">
              أنواع أصلية بلا عمود مستقل: {unmappedCanonicalTypes.map(type => type.name).join('، ')}؛
              لذلك لا تظهر كبطاقات قابلة للقياس.
            </div>
          )}
        </div>

        {/* Quick insights bar */}
        {mostCovered && leastCovered && (
          <div className="bg-green-900 rounded-2xl p-5 text-white grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-green-300 mb-1">الخدمة الأوسع تغطيةً</div>
              <div className="font-bold text-amber-200 text-lg">{mostCovered.name}</div>
              <div className="text-sm text-green-200 mt-0.5">
                {mostCovered.count.toLocaleString('ar-EG')} حديث
                {total > 0 && (
                  <span className="mr-2 text-green-300">
                    ({Math.round((mostCovered.count / total) * 100)}%)
                  </span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-green-300 mb-1">الخدمة الأقل تغطيةً</div>
              <div className="font-bold text-amber-200 text-lg">{leastCovered.name}</div>
              <div className="text-sm text-green-200 mt-0.5">
                {leastCovered.count.toLocaleString('ar-EG')} حديث
                {total > 0 && (
                  <span className="mr-2 text-green-300">
                    ({Math.round((leastCovered.count / total) * 100)}%)
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Service cards grouped by type */}
        {groups.map(group => {
          const groupServices = services.filter(s => s.group === group)
          const style = GROUP_STYLES[group]
          return (
            <section key={group}>
              <div className="flex items-center gap-3 mb-3">
                <span className={`text-xs font-bold px-3 py-1 rounded-full ${style.badge}`}>
                  {GROUP_LABELS[group]}
                </span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupServices.map(service => {
                  const count = countMap[service.key] || 0
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  return (
                    <div
                      key={service.key}
                      className={`rounded-2xl border p-5 transition-all ${style.card}`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className={`font-bold text-base ${style.label}`}>{service.name}</h3>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-bold shrink-0 ${style.badge}`}>
                          {pct}%
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mb-3">{service.desc}</p>
                      <div className="flex items-end justify-between gap-2">
                        <div className="text-2xl font-bold text-gray-800">
                          {count.toLocaleString('ar-EG')}
                        </div>
                        <div className="text-xs text-gray-400">من {total.toLocaleString('ar-EG')}</div>
                      </div>
                      {serviceBar(count, total, style.bar)}
                    </div>
                  )
                })}
              </div>
            </section>
          )
        })}

        {/* Visual comparison — horizontal bars for all services */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-base mb-5">مقارنة بصرية لتغطية الخدمات</h2>
          <div className="space-y-3">
            {sorted.map(service => {
              const pct = total > 0 ? Math.round((service.count / total) * 100) : 0
              const style = GROUP_STYLES[service.group]
              return (
                <div key={service.key} className="flex items-center gap-3">
                  <div className="w-36 shrink-0 text-right">
                    <span className="text-sm text-gray-700">{service.name}</span>
                  </div>
                  <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                    <div
                      className={`h-5 rounded-full ${style.bar} flex items-center justify-end pr-2 transition-all`}
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    >
                      {pct >= 8 && (
                        <span className="text-white text-xs font-bold">{pct}%</span>
                      )}
                    </div>
                  </div>
                  <div className="w-24 shrink-0 text-left">
                    <span className="text-xs text-gray-500 tabular-nums">
                      {service.count.toLocaleString('ar-EG')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Color legend */}
          <div className="flex items-center gap-4 mt-5 pt-4 border-t border-gray-100 flex-wrap text-xs text-gray-500">
            {groups.map(g => (
              <span key={g} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-full ${GROUP_STYLES[g].bar} inline-block`} />
                {GROUP_LABELS[g]}
              </span>
            ))}
          </div>
        </section>

        {/* Top 10 most comprehensively covered hadiths */}
        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="font-bold text-green-900 text-base mb-1">أكثر الأحاديث خدمةً</h2>
          <p className="text-xs text-gray-500 mb-5">
            الأحاديث التي توفر لها أكبر عدد من الخدمات العلمية — التخريج والشرح والفقه وغيرها
          </p>

          {topHadiths.length === 0 ? (
            <div className="bg-gray-50 rounded-xl p-6 text-center text-gray-400 text-sm">
              لا بيانات متاحة
            </div>
          ) : (
            <div className="space-y-3">
              {topHadiths.map((h, idx) => (
                <Link
                  key={h.hadith_id}
                  href={`/hadith/${h.hadith_id}`}
                  className="flex items-start gap-4 p-4 rounded-xl border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all group bg-gray-50 hover:bg-white"
                >
                  {/* Rank */}
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      idx === 0 ? 'bg-yellow-400 text-yellow-900' :
                      idx === 1 ? 'bg-gray-300 text-gray-700' :
                      idx === 2 ? 'bg-amber-600 text-white' :
                      'bg-gray-100 text-gray-500'
                    }`}>
                      {(idx + 1).toLocaleString('ar-EG')}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${serviceCount(h.service_count)}`}>
                      {h.service_count}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 leading-relaxed line-clamp-2 group-hover:text-green-900 transition-colors">
                      {(h.tarf_clean || '').replace(/\s+/g, ' ').trim().slice(0, 200) || '...'}
                    </p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-xs text-green-700 font-medium">{h.book_title}</span>
                      <span className="text-xs text-gray-300">·</span>
                      <span className="text-xs text-gray-400">
                        {h.service_count} {h.service_count === 1 ? 'خدمة' : 'خدمات'}
                      </span>
                    </div>
                  </div>

                  <div className="shrink-0 text-gray-300 group-hover:text-green-500 transition-colors text-lg">
                    ←
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Navigation links */}
        <div className="flex items-center gap-4 text-sm flex-wrap pb-4">
          <Link href="/hadiths/strongest" className="text-green-700 hover:underline">← أصح الأحاديث</Link>
          <Link href="/hadiths/chain-richness" className="text-green-700 hover:underline">← متعددة الأسانيد</Link>
          <Link href="/hadiths/golden-chains" className="text-green-700 hover:underline">← الأسانيد الذهبية</Link>
          <Link href="/stats" className="text-green-700 hover:underline mr-auto">الإحصاءات العامة ←</Link>
        </div>

      </main>
    </div>
  )
}
