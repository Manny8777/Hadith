import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الصحابة والموضوعات — جامع خادم الحرمين' }

interface CompanionRow {
  companion_id: number
  companion_name: string
  total_hadiths: number
}

interface CatRow {
  cat_id: number
  cat_title: string
}

interface CellRow {
  companion_id: number
  cat_id: number
  cnt: number
}

function shortName(full: string): string {
  // Take the first two words after stripping chain prefixes
  return full.replace(/^(ابن|أبو|أبي|أم|عبد)\s/i, m => m).split('،')[0].trim().split(' ').slice(0, 2).join(' ')
}

export default async function TopicsCompanionsPage({
  searchParams,
}: {
  searchParams: Promise<{ min?: string }>
}) {
  const sp = await searchParams
  const minHadiths = Math.max(1, parseInt(sp.min || '10'))

  // Top companions by hadith count (those with enough hadiths to be meaningful)
  const companionsRes = await pool.query<CompanionRow>(
    `SELECT n.id AS companion_id, n.name AS companion_name,
            COUNT(DISTINCT ht.main_id)::int AS total_hadiths
     FROM narrators n
     JOIN isnad_chains ic ON ic.narrator_id_array[1] = n.id
     JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
     JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
     WHERE n.is_companion = true
       AND ht.is_leaf = true AND ht.is_paragraph = true
     GROUP BY n.id, n.name
     HAVING COUNT(DISTINCT ht.main_id) >= $1
     ORDER BY total_hadiths DESC
     LIMIT 40`,
    [minHadiths]
  ).catch(() => ({ rows: [] }))

  // Top-level categories
  const catsRes = await pool.query<CatRow>(
    `SELECT id AS cat_id, title AS cat_title
     FROM subject_categories
     WHERE parent_id = 1
     ORDER BY left_value`
  ).catch(() => ({ rows: [] }))

  const companions = companionsRes.rows
  const cats = catsRes.rows

  if (companions.length === 0 || cats.length === 0) {
    return (
      <div dir="rtl" className="text-center py-12 text-gray-500">
        لا توجد بيانات كافية
      </div>
    )
  }

  const companionIds = companions.map(c => c.companion_id)
  const catIds = cats.map(c => c.cat_id)

  // Build the cross-reference counts
  // For each companion × category: count distinct hadiths tagged under that category's subjects
  const cellsRes = await pool.query<CellRow>(
    `SELECT ic.narrator_id_array[1] AS companion_id,
            sc.id AS cat_id,
            COUNT(DISTINCT ht.main_id)::int AS cnt
     FROM hadith_toc ht
     JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     JOIN hadith_subjects hs ON hs.paragraph_main_id = ht.main_id
     JOIN subject_items si ON si.id = hs.subject_id
     JOIN subject_categories sc ON sc.left_value < si.left_value AND sc.right_value > si.right_value
         AND sc.parent_id = 1
     WHERE ic.narrator_id_array[1] = ANY($1::int[])
       AND sc.id = ANY($2::int[])
       AND ht.is_leaf = true AND ht.is_paragraph = true
     GROUP BY ic.narrator_id_array[1], sc.id`,
    [companionIds, catIds]
  ).catch(() => ({ rows: [] }))

  // Build a lookup map
  const lookup = new Map<string, number>()
  for (const row of cellsRes.rows) {
    lookup.set(`${row.companion_id}:${row.cat_id}`, row.cnt)
  }

  // Find max value for heat-map scaling
  const maxCount = Math.max(...cellsRes.rows.map(r => r.cnt), 1)

  function heatColor(cnt: number): string {
    if (!cnt) return 'bg-gray-50 text-gray-300'
    const ratio = cnt / maxCount
    if (ratio > 0.7) return 'bg-green-700 text-white font-bold'
    if (ratio > 0.4) return 'bg-green-500 text-white'
    if (ratio > 0.2) return 'bg-green-300 text-green-900'
    if (ratio > 0.05) return 'bg-green-100 text-green-800'
    return 'bg-green-50 text-green-700'
  }

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الصحابة والموضوعات</h1>
        <p className="text-sm text-gray-500 mb-3">
          مصفوفة توزيع الأحاديث بين الصحابة الرواة والموضوعات الفقهية — أداة لمعرفة مصادر الرواية في كل موضوع
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-gray-500">الحد الأدنى للأحاديث:</span>
          {[5, 10, 20, 50].map(n => (
            <Link
              key={n}
              href={`/topics/companions?min=${n}`}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                minHadiths === n
                  ? 'bg-green-900 text-white border-green-900'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}
            >
              {n}+
            </Link>
          ))}
          <span className="text-xs text-gray-400 mr-auto">
            {companions.length} صحابي × {cats.length} موضوع
          </span>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 text-xs text-amber-800">
        الأرقام تعكس الأحاديث المصنفة موضوعياً فقط. اللون الأخضر الداكن = عدد مرتفع، الأخضر الفاتح = عدد منخفض، الرمادي = لا توجد أحاديث.
      </div>

      {/* Scrollable matrix */}
      <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm bg-white">
        <table className="text-xs border-collapse min-w-max">
          <thead>
            <tr className="bg-green-900 text-white">
              <th className="sticky right-0 z-10 bg-green-900 px-3 py-2 text-right font-semibold min-w-[140px] border-l border-green-700">
                الصحابي
              </th>
              <th className="px-2 py-2 text-center font-semibold min-w-[50px] border-l border-green-700 bg-green-800">
                المجموع
              </th>
              {cats.map(cat => (
                <th
                  key={cat.cat_id}
                  className="px-1 py-2 font-medium min-w-[60px] border-l border-green-700 whitespace-nowrap"
                  title={cat.cat_title}
                >
                  <Link
                    href={`/topics/${cat.cat_id}`}
                    className="hover:text-amber-300 transition-colors"
                  >
                    {cat.cat_title.length > 8 ? cat.cat_title.slice(0, 8) + '…' : cat.cat_title}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companions.map((comp, idx) => (
              <tr
                key={comp.companion_id}
                className={`hover:bg-amber-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-gray-50/50'}`}
              >
                <td className="sticky right-0 z-10 bg-inherit px-3 py-2 border-l border-gray-100 border-b border-gray-100">
                  <Link
                    href={`/narrator/${comp.companion_id}`}
                    className="text-green-800 hover:text-green-600 hover:underline font-medium"
                  >
                    {shortName(comp.companion_name)}
                  </Link>
                </td>
                <td className="px-2 py-2 text-center font-bold text-green-700 border-l border-gray-100 border-b border-gray-100 bg-green-50/50">
                  {comp.total_hadiths.toLocaleString('ar-EG')}
                </td>
                {cats.map(cat => {
                  const cnt = lookup.get(`${comp.companion_id}:${cat.cat_id}`) || 0
                  return (
                    <td
                      key={cat.cat_id}
                      className={`px-1 py-2 text-center border-l border-gray-100 border-b border-gray-100 transition-colors ${heatColor(cnt)}`}
                      title={cnt ? `${comp.companion_name} — ${cat.cat_title}: ${cnt} حديث` : ''}
                    >
                      {cnt > 0 ? cnt.toLocaleString('ar-EG') : ''}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Legend */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-green-900 mb-3">دليل الألوان</h3>
          <div className="space-y-1">
            {[
              { cls: 'bg-green-700 text-white', label: `أعلى كثافة (> 70% من الحد الأعلى)` },
              { cls: 'bg-green-500 text-white', label: 'كثافة عالية (40-70%)' },
              { cls: 'bg-green-300 text-green-900', label: 'كثافة متوسطة (20-40%)' },
              { cls: 'bg-green-100 text-green-800', label: 'كثافة منخفضة (5-20%)' },
              { cls: 'bg-green-50 text-green-700', label: 'كثافة ضئيلة (< 5%)' },
              { cls: 'bg-gray-50 text-gray-300', label: 'لا توجد أحاديث' },
            ].map(row => (
              <div key={row.label} className="flex items-center gap-2">
                <span className={`w-6 h-4 rounded text-xs flex items-center justify-center shrink-0 ${row.cls}`}>1</span>
                <span className="text-xs text-gray-600">{row.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Navigation links */}
        <div className="bg-white rounded-xl border border-gray-100 p-4">
          <h3 className="text-sm font-semibold text-green-900 mb-3">استكشاف</h3>
          <div className="space-y-2">
            <Link href="/topics" className="block text-sm text-green-700 hover:underline">
              ← تصفح الموضوعات
            </Link>
            <Link href="/topics/stats" className="block text-sm text-green-700 hover:underline">
              ← إحصاءات الموضوعات
            </Link>
            <Link href="/companions" className="block text-sm text-green-700 hover:underline">
              ← قائمة الصحابة
            </Link>
            <Link href="/narrators/generations" className="block text-sm text-green-700 hover:underline">
              ← طبقات الرواة
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
