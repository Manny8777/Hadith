export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

interface NarratorRow {
  id: number
  name: string
  living_city: string | null
  birth_city: string | null
  journey_city: string | null
  death_year_num: number | null
}

function primaryCity(n: NarratorRow): string {
  const raw = (n.living_city || n.birth_city || '').trim()
  if (!raw) return ''
  return raw.split('،')[0].replace(/قال.*?:/g, '').trim()
}

export default async function NarratorsByRegionPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const hadithRes = await pool.query<{ main_id: number }>(
    `SELECT main_id FROM hadith_toc WHERE main_id = $1 LIMIT 1`,
    [hadithId]
  )
  if (!hadithRes.rows[0]) notFound()

  const narratorsRes = await pool.query<NarratorRow>(
    `SELECT DISTINCT ON (n.id)
            n.id, n.name, n.living_city, n.birth_city, n.journey_city, n.death_year_num
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     JOIN narrators n ON n.id = ANY(ic.narrator_id_array)
     WHERE ih.hadith_id = $1
     ORDER BY n.id, n.death_year_num ASC NULLS LAST`,
    [hadithId]
  )

  const narrators = narratorsRes.rows

  // Group by primary city
  const cityMap = new Map<string, NarratorRow[]>()
  const noCityList: NarratorRow[] = []

  for (const n of narrators) {
    const city = primaryCity(n)
    if (city) {
      const bucket = cityMap.get(city) || []
      bucket.push(n)
      cityMap.set(city, bucket)
    } else {
      noCityList.push(n)
    }
  }

  const cities = Array.from(cityMap.entries()).sort((a, b) => b[1].length - a[1].length)

  return (
    <div dir="rtl" className="max-w-3xl mx-auto">
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 flex-wrap">
        <Link href="/" className="hover:text-green-700">الرئيسية</Link>
        <span className="text-gray-300">›</span>
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
        <span className="text-gray-300">›</span>
        <span className="text-green-800 font-medium">الرواية بالبلدان</span>
      </nav>

      <div className="mb-8">
        <h1 className="text-xl font-bold text-green-900 mb-1">الرواية بالبلدان</h1>
        <p className="text-xs text-gray-400">
          {narrators.length} راوٍ · {cities.length} بلد
        </p>
      </div>

      {cities.length === 0 && noCityList.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-12 bg-gray-50 rounded-xl border border-gray-100">
          لا تتوفر بيانات جغرافية لرواة هذا الحديث
        </div>
      )}

      <div className="space-y-6">
        {cities.map(([city, narrs]) => (
          <section key={city}>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-bold text-green-900">{city}</h2>
              <span className="text-xs text-gray-400 font-normal">{narrs.length} راوٍ</span>
            </div>
            <div className="space-y-1.5">
              {narrs.map(n => (
                <Link
                  key={n.id}
                  href={`/narrator/${n.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-green-200 hover:shadow-sm transition-all group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 group-hover:text-green-800 leading-snug">{n.name}</p>
                    {n.journey_city && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        رحل إلى: {n.journey_city.split('،')[0].trim()}
                      </p>
                    )}
                  </div>
                  {n.death_year_num && (
                    <span className="text-xs text-gray-400 shrink-0 mt-1">ت {n.death_year_num}هـ</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}

        {noCityList.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-bold text-gray-400">غير محدد البلد</h2>
              <span className="text-xs text-gray-400">{noCityList.length} راوٍ</span>
            </div>
            <div className="space-y-1.5">
              {noCityList.map(n => (
                <Link
                  key={n.id}
                  href={`/narrator/${n.id}`}
                  className="flex items-start gap-3 px-4 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-gray-200 transition-all group"
                >
                  <p className="text-sm text-gray-600 group-hover:text-green-800 flex-1 leading-snug">{n.name}</p>
                  {n.death_year_num && (
                    <span className="text-xs text-gray-400 shrink-0 mt-1">ت {n.death_year_num}هـ</span>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <div className="mt-8 pt-4 border-t border-gray-100">
        <Link href={`/hadith/${hadithId}`} className="text-sm text-green-700 hover:underline">
          ← العودة للحديث
        </Link>
      </div>
    </div>
  )
}
