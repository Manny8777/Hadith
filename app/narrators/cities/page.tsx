export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'

interface SearchParams { city?: string; page?: string }

function gradeColor(grade: string | null) {
  if (!grade) return 'bg-gray-100 text-gray-500'
  if (/ثقة|صحيح|عدل|صحابي/.test(grade)) return 'bg-green-100 text-green-700'
  if (/صدوق|حسن|مقبول/.test(grade)) return 'bg-amber-100 text-amber-700'
  if (/ضعيف|منكر|متروك|كذاب/.test(grade)) return 'bg-red-100 text-red-600'
  return 'bg-gray-100 text-gray-500'
}

export default async function NarratorCitiesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const sp = await searchParams
  const selectedCity = sp.city || ''
  const page = Math.max(1, parseInt(sp.page || '1', 10))
  const pageSize = 40
  const offset = (page - 1) * pageSize

  // All cities with narrator counts
  const { rows: cities } = await pool.query(`
    SELECT city, COUNT(*) as cnt FROM (
      SELECT death_city as city FROM narrators WHERE death_city IS NOT NULL AND death_city != ''
      UNION ALL
      SELECT living_city as city FROM narrators WHERE living_city IS NOT NULL AND living_city != '' AND (death_city IS NULL OR death_city = '')
    ) t
    WHERE city IS NOT NULL AND city != ''
    GROUP BY city
    ORDER BY cnt DESC, city
  `)

  const totalCities = cities.length

  // Narrators in selected city
  let narrators: Array<{
    id: number; name: string; abb_name: string | null;
    martaba_ibn_hajar: string | null; death_year_num: number | null;
    tabaqa: string | null; hadiths_count: number | null;
    death_city: string | null; living_city: string | null
  }> = []
  let totalCount = 0

  if (selectedCity) {
    const [countRes, listRes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) FROM narrators
         WHERE (death_city = $1 OR (living_city = $1 AND (death_city IS NULL OR death_city = '')))`,
        [selectedCity]
      ),
      pool.query(
        `SELECT id, name, abb_name, martaba_ibn_hajar, death_year_num, tabaqa, hadiths_count, death_city, living_city
         FROM narrators
         WHERE (death_city = $1 OR (living_city = $1 AND (death_city IS NULL OR death_city = '')))
         ORDER BY hadiths_count DESC NULLS LAST, name
         LIMIT $2 OFFSET $3`,
        [selectedCity, pageSize, offset]
      ),
    ])
    totalCount = parseInt(countRes.rows[0].count)
    narrators = listRes.rows
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div dir="rtl" className="min-h-screen bg-amber-50">
      <header className="bg-green-900 text-white shadow-lg">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/narrators" className="text-amber-200 hover:text-white text-sm">← الرواة</Link>
          <h1 className="text-lg font-bold text-amber-100">الرواة حسب البلد</h1>
          <Link href="/" className="text-amber-200 hover:text-white text-sm">الرئيسية</Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8 flex flex-col gap-6 lg:flex-row lg:items-start">

        {/* City list sidebar */}
        <aside className="lg:w-60 shrink-0">
          <div className="bg-white rounded-2xl border border-gray-100 p-4">
            <h2 className="text-sm font-bold text-green-900 mb-3">
              البلدان ({totalCities})
            </h2>
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {cities.map(c => (
                <Link
                  key={c.city}
                  href={`/narrators/cities?city=${encodeURIComponent(c.city)}`}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                    selectedCity === c.city
                      ? 'bg-green-900 text-white font-semibold'
                      : 'hover:bg-amber-50 text-gray-700'
                  }`}
                >
                  <span>{c.city}</span>
                  <span className={`text-xs font-mono ${selectedCity === c.city ? 'text-amber-200' : 'text-gray-400'}`}>
                    {parseInt(c.cnt).toLocaleString('ar-EG')}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </aside>

        {/* Narrator list */}
        <div className="flex-1">
          {selectedCity ? (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-base font-bold text-green-900 mb-1">
                  رواة {selectedCity}
                </h2>
                <p className="text-xs text-gray-400 mb-4">{totalCount.toLocaleString('ar-EG')} راوٍ</p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {narrators.map(n => (
                    <Link
                      key={n.id}
                      href={`/narrator/${n.id}`}
                      className="flex items-center gap-3 bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-green-900 group-hover:text-green-700 text-sm leading-snug truncate">
                          {n.abb_name || n.name}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5 flex gap-2">
                          {n.death_year_num != null && <span>ت {n.death_year_num}</span>}
                          {n.tabaqa?.trim() && <span>{n.tabaqa.trim()}</span>}
                        </div>
                      </div>
                      {n.martaba_ibn_hajar?.trim() && (
                        <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${gradeColor(n.martaba_ibn_hajar)}`}>
                          {n.martaba_ibn_hajar}
                        </span>
                      )}
                      {n.hadiths_count != null && n.hadiths_count > 0 && (
                        <span className="shrink-0 text-xs text-green-700 font-semibold">
                          {n.hadiths_count.toLocaleString('ar-EG')}
                        </span>
                      )}
                    </Link>
                  ))}
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-4 flex-wrap">
                  {page > 1 && (
                    <Link
                      href={`/narrators/cities?city=${encodeURIComponent(selectedCity)}&page=${page - 1}`}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-300"
                    >
                      السابق
                    </Link>
                  )}
                  <span className="px-4 py-2 text-sm text-gray-500 bg-white border border-gray-100 rounded-lg">
                    {page} / {totalPages}
                  </span>
                  {page < totalPages && (
                    <Link
                      href={`/narrators/cities?city=${encodeURIComponent(selectedCity)}&page=${page + 1}`}
                      className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm hover:border-green-300"
                    >
                      التالي
                    </Link>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400">
              <p className="text-lg font-medium text-gray-600 mb-2">اختر بلداً من القائمة</p>
              <p className="text-sm">لعرض رواة الحديث المنتسبين إليه</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
