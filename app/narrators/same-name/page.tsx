import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'تمييز الرواة المتشابهة أسماؤهم — جامع خادم الحرمين' }

interface NameGroup {
  name: string
  cnt: number
  has_companion: boolean
}

interface NarratorInGroup {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  death_year: string | null
  tabaqa: string | null
  martaba_ibn_hajar: string | null
  is_companion: boolean
  hadiths_count: number
}

function gradeClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-100 text-green-700'
  if (g.includes('صدوق') || g.includes('لا بأس') || g.includes('حسن')) return 'bg-amber-100 text-amber-700'
  if (g.includes('ضعيف') || g.includes('متروك') || g.includes('منكر')) return 'bg-red-100 text-red-600'
  if (g.includes('مجهول')) return 'bg-gray-100 text-gray-500'
  return 'bg-blue-50 text-blue-700'
}

export default async function SameNamePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; name?: string; page?: string }>
}) {
  const sp = await searchParams
  const query = sp.q?.trim() || ''
  const selectedName = sp.name?.trim() || ''
  const pg = Math.max(1, parseInt(sp.page || '1'))
  const limit = 50
  const offset = (pg - 1) * limit

  const searchParam: (string | number)[] = []
  const searchClause = query
    ? `AND name ILIKE $${searchParam.push(`%${query}%`)}`
    : ''

  const [groupsRes, narratorsInGroupRes, totalRes] = await Promise.all([
    pool.query<NameGroup>(
      `SELECT name, COUNT(*)::int AS cnt,
              BOOL_OR(is_companion) AS has_companion
       FROM narrators
       WHERE 1=1 ${searchClause}
       GROUP BY name
       HAVING COUNT(*) > 1
       ORDER BY COUNT(*) DESC, name
       LIMIT ${limit} OFFSET ${offset}`,
      searchParam
    ).catch(() => ({ rows: [] as NameGroup[] })),

    selectedName ? pool.query<NarratorInGroup>(
      `SELECT id, name, abb_name, kunia, death_year_num AS death_year, tabaqa, martaba_ibn_hajar,
              is_companion, hadiths_count
       FROM narrators
       WHERE name = $1
       ORDER BY is_companion DESC, hadiths_count DESC`,
      [selectedName]
    ).catch(() => ({ rows: [] as NarratorInGroup[] })) : Promise.resolve({ rows: [] as NarratorInGroup[] }),

    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM (
         SELECT name FROM narrators WHERE 1=1 ${searchClause}
         GROUP BY name HAVING COUNT(*) > 1
       ) sub`,
      searchParam
    ).catch(() => ({ rows: [{ cnt: 0 }] })),
  ])

  const groups = groupsRes.rows
  const narratorsInGroup = narratorsInGroupRes.rows
  const total = totalRes.rows[0]?.cnt || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    if (query) p.set('q', query)
    if (selectedName) p.set('name', selectedName)
    p.set('page', '1')
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/narrators/same-name?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">تمييز الرواة المتشابهة أسماؤهم</h1>
        <p className="text-sm text-gray-500 mb-3">
          أسماء تتشارك فيها أكثر من راوٍ — أداة لتحديد أيّ الرواة المقصود عند إبهام الاسم في الإسناد
        </p>

        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
          <span className="font-semibold">أهمية بحثية: </span>
          التشابه في الأسماء من أكبر مشكلات الإسناد؛ فكثيراً ما يُذكر الراوي باسمه المجرد كـ"محمد بن عبد الله"
          دون تحديد نسبه، مما يستدعي التحقق من الطبقة والكنية والشيوخ للجزم بهويته.
        </div>

        {/* Search */}
        <form method="get" className="flex gap-2 mb-4">
          <input
            name="q"
            defaultValue={query}
            placeholder="ابحث عن اسم..."
            className="flex-1 min-w-0 border border-gray-200 rounded-xl px-4 py-2 text-sm bg-white focus:outline-none focus:border-green-400"
          />
          <button type="submit"
            className="bg-green-800 text-white px-4 py-2 rounded-xl text-sm hover:bg-green-700 transition-colors">
            بحث
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* Name groups list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-green-900">
              {total.toLocaleString('ar-EG')} اسم مشترك
            </h2>
            {selectedName && (
              <Link href={buildUrl({ name: '' })}
                className="text-xs text-gray-500 hover:text-gray-700">
                ✕ إلغاء الاختيار
              </Link>
            )}
          </div>

          <div className="space-y-1.5">
            {groups.map(g => (
              <Link key={g.name}
                href={buildUrl({ name: g.name })}
                className={`flex items-center justify-between px-4 py-2.5 rounded-xl border transition-all ${
                  selectedName === g.name
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white border-gray-100 hover:border-green-200 hover:shadow-sm'
                }`}>
                <span className={`font-semibold text-sm ${selectedName === g.name ? 'text-white' : 'text-green-900'}`}>
                  {g.name}
                </span>
                <div className="flex items-center gap-2">
                  {g.has_companion && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      selectedName === g.name ? 'bg-amber-300 text-amber-900' : 'bg-amber-100 text-amber-700'
                    }`}>
                      صحابي
                    </span>
                  )}
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    selectedName === g.name ? 'bg-white/20 text-white' :
                    g.cnt >= 5 ? 'bg-red-100 text-red-700' :
                    g.cnt >= 3 ? 'bg-amber-100 text-amber-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {g.cnt} رواة
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {groups.length === 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
              لا توجد أسماء مشتركة بهذا البحث
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex items-center gap-2 flex-wrap">
              {pg > 1 && (
                <Link href={buildUrl({ page: String(pg - 1) })}
                  className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  السابق
                </Link>
              )}
              <span className="text-xs text-gray-500">صفحة {pg} من {totalPages}</span>
              {pg < totalPages && (
                <Link href={buildUrl({ page: String(pg + 1) })}
                  className="px-3 py-1 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm">
                  التالي
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Selected name detail */}
        {selectedName && narratorsInGroup.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-green-900 mb-3">
              الرواة المسمَّون بـ «{selectedName}»
            </h2>
            <div className="space-y-3">
              {narratorsInGroup.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 hover:shadow-sm transition-all">
                  <div className="flex items-start justify-between gap-2 mb-2 flex-wrap">
                    <Link href={`/narrator/${n.id}`}
                      className="font-bold text-green-900 hover:underline text-sm">
                      {n.name}
                    </Link>
                    <div className="flex items-center gap-1 shrink-0">
                      {n.is_companion && (
                        <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-medium">صحابي</span>
                      )}
                      {n.martaba_ibn_hajar && !n.is_companion && (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeClass(n.martaba_ibn_hajar)}`}>
                          {n.martaba_ibn_hajar.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                    {n.abb_name && n.abb_name !== n.name && (
                      <>
                        <span className="text-gray-400">اللقب:</span>
                        <span>{n.abb_name}</span>
                      </>
                    )}
                    {n.kunia && (
                      <>
                        <span className="text-gray-400">الكنية:</span>
                        <span>{n.kunia}</span>
                      </>
                    )}
                    {n.tabaqa && (
                      <>
                        <span className="text-gray-400">الطبقة:</span>
                        <span>{n.tabaqa}</span>
                      </>
                    )}
                    {n.death_year && (
                      <>
                        <span className="text-gray-400">الوفاة:</span>
                        <span>{n.death_year}</span>
                      </>
                    )}
                    {n.hadiths_count > 0 && (
                      <>
                        <span className="text-gray-400">الأحاديث:</span>
                        <span>{n.hadiths_count.toLocaleString('ar-EG')}</span>
                      </>
                    )}
                  </div>

                  <div className="mt-2">
                    <Link href={`/narrator/${n.id}`}
                      className="text-xs text-indigo-600 hover:underline">
                      عرض الترجمة الكاملة ←
                    </Link>
                  </div>
                </div>
              ))}

              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                <span className="font-semibold">دلائل التمييز: </span>
                للتمييز بين هؤلاء الرواة في السند: استخدم الطبقة الزمنية — الطبقة الأسبق تنقل عمَّن قبلها.
                وانظر الكنية إن ذُكرت. وراجع شيوخ كل راوٍ وتلاميذه.
              </div>
            </div>
          </div>
        )}

        {/* No name selected */}
        {!selectedName && (
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
            <p className="text-sm">اختر اسماً من القائمة لعرض الرواة المشتركين فيه</p>
            <p className="text-xs mt-2 text-gray-400">أو ابحث عن اسم محدد</p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/kunia-index" className="text-green-700 hover:underline">← فهرس الكنى</Link>
        <Link href="/narrators/alpha-index" className="text-green-700 hover:underline">← الفهرس الأبجدي</Link>
        <Link href="/narrators" className="text-green-700 hover:underline">← كل الرواة</Link>
      </div>
    </div>
  )
}
