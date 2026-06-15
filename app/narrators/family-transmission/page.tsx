import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface FamilyPair {
  narrator1_id: number
  narrator1_name: string
  narrator1_death: string | null
  narrator1_grade: string | null
  narrator2_id: number
  narrator2_name: string
  narrator2_death: string | null
  narrator2_grade: string | null
  shared_chains: number
  shared_hadiths: number
  shared_name_part: string
}

interface FamilyChain {
  chain_id: number
  narrators: string[]
  hadith_text: string
  book_name: string
}

export default async function FamilyTransmissionPage({
  searchParams,
}: {
  searchParams: Promise<{ n1?: string; n2?: string; page?: string }>
}) {
  const sp = await searchParams
  const n1 = parseInt(sp.n1 || '0') || null
  const n2 = parseInt(sp.n2 || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const [familyPairsRes, detailRes] = await Promise.all([
    pool.query<FamilyPair>(
      `SELECT
         n1.id AS narrator1_id,
         n1.name AS narrator1_name,
         n1.death_year AS narrator1_death,
         n1.martaba_ibn_hajar AS narrator1_grade,
         n2.id AS narrator2_id,
         n2.name AS narrator2_name,
         n2.death_year AS narrator2_death,
         n2.martaba_ibn_hajar AS narrator2_grade,
         COUNT(DISTINCT ic.id)::int AS shared_chains,
         COUNT(DISTINCT ih.hadith_id)::int AS shared_hadiths,
         SPLIT_PART(n1.name, ' ', 2) AS shared_name_part
       FROM narrators n1
       JOIN narrators n2 ON n2.id != n1.id
         AND SPLIT_PART(n1.name, ' ', 2) = SPLIT_PART(n2.name, ' ', 2)
         AND SPLIT_PART(n1.name, ' ', 2) != ''
         AND LENGTH(SPLIT_PART(n1.name, ' ', 2)) >= 4
         AND n1.id < n2.id
       JOIN isnad_chains ic ON n1.id = ANY(ic.narrator_id_array) AND n2.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       WHERE n1.death_year_num IS NOT NULL AND n2.death_year_num IS NOT NULL
         AND ABS(n1.death_year_num - n2.death_year_num) <= 80
       GROUP BY n1.id, n1.name, n1.death_year, n1.martaba_ibn_hajar,
                n2.id, n2.name, n2.death_year, n2.martaba_ibn_hajar,
                SPLIT_PART(n1.name, ' ', 2)
       HAVING COUNT(DISTINCT ic.id) >= 3
       ORDER BY shared_chains DESC
       LIMIT 30`,
      []
    ).catch(() => ({ rows: [] as FamilyPair[] })),

    (n1 && n2) ? pool.query<FamilyChain>(
      `SELECT
         ic.id AS chain_id,
         ARRAY(SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord) AS narrators,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE $1 = ANY(ic.narrator_id_array)
         AND $2 = ANY(ic.narrator_id_array)
       ORDER BY ic.id
       LIMIT $3 OFFSET $4`,
      [n1, n2, pageSize, offset]
    ).catch(() => ({ rows: [] as FamilyChain[] })) : Promise.resolve({ rows: [] as FamilyChain[] }),
  ])

  const pairs = familyPairsRes.rows
  const chains = detailRes.rows

  const selected = n1 && n2 ? pairs.find(p => (p.narrator1_id === n1 && p.narrator2_id === n2) || (p.narrator1_id === n2 && p.narrator2_id === n1)) : null

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواية العائلية — رواة يجمعهم النسب</h1>
        <p className="text-sm text-gray-500">
          رواة يتشاركون في الاسم الثاني (اسم الأب) ويظهرون معاً في أسانيد — يكشف انتقال العلم داخل الأسر الحديثية
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden mb-5">
        <div className="bg-green-50 px-4 py-2 border-b border-gray-100 text-xs text-green-800 font-medium">
          أبرز الثنائيات العائلية — بعدد الأسانيد المشتركة
        </div>
        <div className="divide-y divide-gray-50">
          {pairs.map(p => (
            <a key={`${p.narrator1_id}-${p.narrator2_id}`}
              href={`/narrators/family-transmission?n1=${p.narrator1_id}&n2=${p.narrator2_id}`}
              className={`px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors ${
                selected?.narrator1_id === p.narrator1_id && selected?.narrator2_id === p.narrator2_id ? 'bg-green-50' : ''
              }`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-sm font-medium text-green-900`}>
                    {p.narrator1_name.split(' ').slice(0, 3).join(' ')}
                  </span>
                  {p.narrator1_death && <span className="text-xs text-gray-400">ت {p.narrator1_death}</span>}
                  {p.narrator1_grade && <span className={`text-xs ${gradeColor(p.narrator1_grade)}`}>{p.narrator1_grade.slice(0, 12)}</span>}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                  <span className={`text-sm font-medium text-blue-900`}>
                    {p.narrator2_name.split(' ').slice(0, 3).join(' ')}
                  </span>
                  {p.narrator2_death && <span className="text-xs text-gray-400">ت {p.narrator2_death}</span>}
                  {p.narrator2_grade && <span className={`text-xs ${gradeColor(p.narrator2_grade)}`}>{p.narrator2_grade.slice(0, 12)}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  مشتركان في: «{p.shared_name_part}»
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-sm font-bold text-green-700">{p.shared_chains} سند</div>
                <div className="text-xs text-gray-400">{p.shared_hadiths} حديث</div>
              </div>
            </a>
          ))}
        </div>

        {pairs.length === 0 && (
          <div className="p-8 text-center text-sm text-gray-400">
            لا توجد بيانات كافية لتحليل الرواية العائلية
          </div>
        )}
      </div>

      {n1 && n2 && chains.length > 0 && (
        <>
          <h2 className="font-bold text-green-900 text-sm mb-3">
            الأسانيد المشتركة بين الراويين
          </h2>
          <div className="space-y-3">
            {chains.map((ch, ci) => (
              <div key={ch.chain_id} className="bg-white rounded-xl border border-gray-100 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs text-gray-400">سند {(ci + 1 + offset).toLocaleString('ar-EG')}</span>
                  <span className="text-xs font-medium text-gray-600">{ch.book_name}</span>
                </div>
                <div className="flex flex-wrap gap-1 items-center mb-2">
                  {ch.narrators.map((name, ni) => (
                    <div key={ni} className="flex items-center gap-1">
                      <span className={`text-xs px-2 py-0.5 rounded-lg ${
                        ni === 0 ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-gray-50 border border-gray-100 text-gray-700'
                      }`}>
                        {name.split(' ').slice(0, 2).join(' ')}
                      </span>
                      {ni < ch.narrators.length - 1 && <span className="text-gray-300 text-xs">←</span>}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{ch.hadith_text}...</p>
              </div>
            ))}
          </div>

          {(chains.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-4 justify-center">
              {page > 1 && (
                <a href={`/narrators/family-transmission?n1=${n1}&n2=${n2}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  ← السابق
                </a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {chains.length === pageSize && (
                <a href={`/narrators/family-transmission?n1=${n1}&n2=${n2}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">
                  التالي →
                </a>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
        <Link href="/narrators/same-name" className="text-green-700 hover:underline">← الأسماء المتشابهة</Link>
        <Link href="/narrators/transmission-pairs" className="text-green-700 hover:underline">← أزواج الرواية</Link>
      </div>
    </div>
  )
}
