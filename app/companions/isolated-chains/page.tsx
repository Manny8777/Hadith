import pool from '@/lib/db'
import Link from 'next/link'
import StretchedLink from '@/app/components/StretchedLink'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الصحابة ذوو الطرق المحدودة — جامع خادم الحرمين' }

interface CompanionRow {
  id: number
  name: string
  abb_name: string | null
  hadiths_count: number
  direct_narrators: number
  death_year: string | null
}

interface DirectNarrator {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  chain_count: number
}

function gradeClass(g: string | null) {
  if (!g) return 'bg-gray-100 text-gray-500'
  if (g.includes('ثق') || g.includes('حافظ')) return 'bg-green-100 text-green-700'
  if (g.includes('صدوق') || g.includes('لا بأس')) return 'bg-amber-100 text-amber-700'
  if (g.includes('ضعيف') || g.includes('متروك')) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

export default async function IsolatedChainsPage({
  searchParams,
}: {
  searchParams: Promise<{ max_narrators?: string; min_hadiths?: string; companion?: string }>
}) {
  const sp = await searchParams
  const maxNarrators = Math.max(1, Math.min(10, parseInt(sp.max_narrators || '3')))
  const minHadiths = Math.max(1, parseInt(sp.min_hadiths || '5'))
  const selectedCompanionId = sp.companion ? parseInt(sp.companion) : null

  const [companionsRes, directNarratorsRes] = await Promise.all([
    pool.query<CompanionRow>(
      `SELECT comp.id, comp.name, comp.abb_name, comp.hadiths_count, comp.death_year_num AS death_year,
              COUNT(DISTINCT ic.narrator_id_array[2])::int AS direct_narrators
       FROM narrators comp
       JOIN isnad_chains ic ON ic.narrator_id_array[1] = comp.id
         AND array_length(ic.narrator_id_array, 1) >= 2
       WHERE comp.is_companion = true AND comp.hadiths_count >= $2
       GROUP BY comp.id, comp.name, comp.abb_name, comp.hadiths_count, comp.death_year_num
       HAVING COUNT(DISTINCT ic.narrator_id_array[2]) <= $1
       ORDER BY direct_narrators ASC, comp.hadiths_count DESC
       LIMIT 100`,
      [maxNarrators, minHadiths]
    ).catch(() => ({ rows: [] as CompanionRow[] })),

    selectedCompanionId ? pool.query<DirectNarrator>(
      `SELECT n.id, n.name, n.abb_name, n.martaba_ibn_hajar,
              COUNT(DISTINCT ic.id)::int AS chain_count
       FROM isnad_chains ic
       JOIN narrators n ON n.id = ic.narrator_id_array[2]
       WHERE ic.narrator_id_array[1] = $1
         AND array_length(ic.narrator_id_array, 1) >= 2
       GROUP BY n.id, n.name, n.abb_name, n.martaba_ibn_hajar
       ORDER BY chain_count DESC`,
      [selectedCompanionId]
    ).catch(() => ({ rows: [] as DirectNarrator[] })) : Promise.resolve({ rows: [] as DirectNarrator[] }),
  ])

  const companions = companionsRes.rows
  const directNarrators = directNarratorsRes.rows
  const selectedCompanion = companions.find(c => c.id === selectedCompanionId)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('max_narrators', String(maxNarrators))
    p.set('min_hadiths', String(minHadiths))
    if (selectedCompanionId) p.set('companion', String(selectedCompanionId))
    Object.entries(overrides).forEach(([k, v]) => {
      if (v) p.set(k, v); else p.delete(k)
    })
    return `/companions/isolated-chains?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الصحابة ذوو الطرق المحدودة</h1>
        <p className="text-sm text-gray-500 mb-3">
          صحابة تنفرد عنهم قلة من الرواة في الطبقة التالية — يكشف محدودية الطرق وأهمية كل راوٍ في الإسناد
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
          <span className="font-semibold">أهمية بحثية: </span>
          إذا كان حديث صحابي ينفرد بروايته راوٍ واحد من التابعين، فهذا يعني أن كل قوة الإسناد
          تعتمد على ذلك الراوي وحده. وقد يكون هذا سبباً لاشتراط العلماء في مثل هذا الراوي مستوى توثيق أعلى.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأقصى للرواة المباشرين:</span>
          {[1, 2, 3, 5, 10].map(n => (
            <Link key={n} href={buildUrl({ max_narrators: String(n), companion: '' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                maxNarrators === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n} راوٍ أو أقل
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للأحاديث:</span>
          {[5, 10, 20, 50, 100].map(n => (
            <Link key={n} href={buildUrl({ min_hadiths: String(n), companion: '' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minHadiths === n
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {n}+ حديث
            </Link>
          ))}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-4 ${selectedCompanionId ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>

        {/* Companions list */}
        <div>
          <h2 className="text-sm font-bold text-green-900 mb-3">
            {companions.length.toLocaleString('ar-EG')} صحابي
          </h2>
          <div className="space-y-2">
            {companions.map(c => (
              <div key={c.id}
                className={`relative block rounded-xl border px-4 py-3 transition-all hover:shadow-sm ${
                  selectedCompanionId === c.id
                    ? 'border-green-400 bg-green-50'
                    : 'border-gray-100 bg-white hover:border-green-200'
                }`}>
                <StretchedLink href={buildUrl({ companion: String(c.id) })} label={c.abb_name || c.name} />
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-1">
                    <Link href={`/narrator/${c.id}`}
                      className="relative z-10 font-semibold text-sm text-green-900 hover:underline">
                      {c.abb_name || c.name}
                    </Link>
                    {c.death_year && <span className="text-xs text-gray-400">ت {c.death_year}</span>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      c.direct_narrators === 1 ? 'bg-red-100 text-red-700' :
                      c.direct_narrators === 2 ? 'bg-amber-100 text-amber-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {c.direct_narrators} {c.direct_narrators === 1 ? 'راوٍ وحيد' : 'رواة'}
                    </span>
                    <span className="text-xs text-gray-400">
                      {c.hadiths_count.toLocaleString('ar-EG')} ح
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {companions.length === 0 && (
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
              لا توجد نتائج بهذه الفلاتر
            </div>
          )}
        </div>

        {/* Direct narrators detail panel */}
        {selectedCompanionId && selectedCompanion && (
          <div>
            <h2 className="text-sm font-bold text-green-900 mb-3">
              من روى عن {selectedCompanion.abb_name || selectedCompanion.name} مباشرة
            </h2>
            <div className="space-y-2">
              {directNarrators.map(n => (
                <div key={n.id} className="bg-white rounded-xl border border-gray-100 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/narrator/${n.id}`}
                      className="font-semibold text-sm text-green-900 hover:underline flex-1">
                      {n.abb_name || n.name}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {n.martaba_ibn_hajar && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${gradeClass(n.martaba_ibn_hajar)}`}>
                          {n.martaba_ibn_hajar.slice(0, 8)}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">{n.chain_count} سند</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {directNarrators.length === 1 && (
              <div className="mt-3 bg-red-50 border border-red-100 rounded-xl p-3 text-xs text-red-800">
                <span className="font-semibold">تنبيه: </span>
                هذا الصحابي لا يُعرف عنه راوٍ مباشر سوى{' '}
                <strong>{directNarrators[0].abb_name || directNarrators[0].name}</strong>.
                إذا كان هذا الراوي ضعيفاً، فجميع أحاديث الصحابي تأخذ حكم روايته.
              </div>
            )}

            <div className="mt-3">
              <Link href={`/narrator/${selectedCompanionId}`}
                className="text-sm text-green-700 hover:underline">
                صفحة {selectedCompanion.abb_name || selectedCompanion.name} الكاملة ←
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة</Link>
        <Link href="/companions/top-hadiths" className="text-green-700 hover:underline">← أشهر أحاديث الصحابة</Link>
        <Link href="/hadiths/chain-gaps" className="text-green-700 hover:underline">← كاشف الانقطاع</Link>
      </div>
    </div>
  )
}