import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'المسانيد — جامع خادم الحرمين' }

interface CompanionRow {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  hadith_count: number
  chain_count: number
  book_count: number
  chapter_count: number
}

export default async function MusnadIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const sp = await searchParams
  const q = sp.q?.trim() || ''

  const companionsRes = await pool.query<CompanionRow>(
    `SELECT
       n.id,
       n.name,
       n.abb_name,
       n.death_year_num AS death_year,
       COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
       COUNT(DISTINCT ic.id)::int AS chain_count,
       COUNT(DISTINCT ht.book_id)::int AS book_count,
       COUNT(DISTINCT COALESCE(ht.chapter_text, ''))::int AS chapter_count
     FROM narrators n
     JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id
     JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
     JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
     WHERE n.is_companion = true
       ${q ? `AND (n.name ~* $1 OR n.abb_name ~* $1)` : ''}
     GROUP BY n.id, n.name, n.abb_name, n.death_year_num
     HAVING COUNT(DISTINCT ih.hadith_id) > 0
     ORDER BY hadith_count DESC
     LIMIT 100`,
    q ? [q] : []
  ).catch(() => ({ rows: [] as CompanionRow[] }))

  const companions = companionsRes.rows
  const maxHadiths = Math.max(...companions.map(c => c.hadith_count), 1)

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">مسانيد الصحابة</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث كل صحابي منظَّمةً حسب أبواب الكتب — على نمط مسند الإمام أحمد
        </p>
      </div>

      {/* Search */}
      <form action="/companions/musnad" method="get"
        className="flex gap-2 mb-5">
        <input type="text" name="q" defaultValue={q}
          placeholder="ابحث عن صحابي..."
          className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-2 focus:outline-none focus:border-green-400" />
        <button type="submit"
          className="text-sm bg-green-800 text-white px-4 py-2 rounded-xl hover:bg-green-700">بحث</button>
        {q && <a href="/companions/musnad" className="text-sm text-gray-400 hover:text-gray-600 self-center px-2">×</a>}
      </form>

      <div className="text-xs text-gray-400 mb-3">
        {companions.length.toLocaleString('ar-EG')} صحابياً لديهم أحاديث في الأسانيد
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-50">
          {companions.map((c, i) => (
            <Link key={c.id}
              href={`/companions/musnad/${c.id}`}
              className="flex items-center gap-3 px-4 py-3 hover:bg-amber-50 transition-colors">
              <span className="text-xs text-gray-300 w-6 text-center shrink-0">
                {(i + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-amber-900 text-sm">{c.name}</div>
                <div className="text-xs text-gray-400 flex gap-2 mt-0.5">
                  {c.death_year && <span>ت {c.death_year}</span>}
                  <span>{c.chapter_count} باب</span>
                  <span>{c.book_count} كتاب</span>
                </div>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <div className="w-24 bg-gray-100 rounded-full h-1.5 hidden sm:block">
                  <div className="bg-amber-400 h-1.5 rounded-full"
                    style={{ width: `${(c.hadith_count / maxHadiths) * 100}%` }} />
                </div>
                <span className="text-xs font-medium text-amber-800 w-14 text-left">
                  {c.hadith_count.toLocaleString('ar-EG')} ح
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/companions" className="text-green-700 hover:underline">← الصحابة الرواة</Link>
        <Link href="/companions/compare" className="text-green-700 hover:underline">← مقارنة الصحابة</Link>
        <Link href="/hadiths/companion-count" className="text-green-700 hover:underline">← المتواتر والغريب</Link>
      </div>
    </div>
  )
}
