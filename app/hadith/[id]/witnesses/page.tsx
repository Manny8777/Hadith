import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface WitnessHadith {
  companion_id: number | null
  companion_name: string | null
  companion_abb: string | null
  hadith_id: number
  tarf: string | null
  book_title: string
  takhrij_author: string | null
  takhrij_death: number | null
  chain_count: number
}

function stripTags(s: string | null) {
  return (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export default async function HadithWitnessesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) notFound()

  const [hadithRes, groupRes] = await Promise.all([
    pool.query(
      `SELECT ht.main_id,
              regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
              b.title AS book_title, b.takhrij_author
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.main_id = $1`,
      [hadithId]
    ),
    pool.query<{ group_id: number }>(
      `SELECT group_id FROM takhrij WHERE hadith_id = $1 AND group_id IS NOT NULL LIMIT 1`,
      [hadithId]
    ),
  ])

  const hadith = hadithRes.rows[0]
  if (!hadith) notFound()

  const groupId = groupRes.rows[0]?.group_id
  if (!groupId) {
    return (
      <div dir="rtl">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
          <Link href="/books" className="hover:text-green-700">الكتب</Link>
          <span>›</span>
          <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
          <span>›</span>
          <span className="text-gray-700">الشواهد والمتابعات</span>
        </div>
        <h1 className="text-xl font-bold text-green-900 mb-3">الشواهد والمتابعات</h1>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لم يُعثر على تخريج مشترك لهذا الحديث في قاعدة البيانات
        </div>
        <div className="mt-4">
          <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline text-sm">← عودة للحديث</Link>
        </div>
      </div>
    )
  }

  const witnessesRes = await pool.query<WitnessHadith>(
    `SELECT DISTINCT ON (COALESCE(comp.id::text, t2.hadith_id::text))
           comp.id AS companion_id,
           comp.name AS companion_name, comp.abb_name AS companion_abb,
           t2.hadith_id,
           regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g') AS tarf,
           b.title AS book_title, b.takhrij_author, b.takhrij_death,
           (
             SELECT COUNT(DISTINCT ic3.id)::int
             FROM isnad_hadiths ih3
             JOIN isnad_chains ic3 ON ic3.id = ih3.isnad_id
             WHERE ih3.hadith_id = t2.hadith_id
           ) AS chain_count
     FROM takhrij t2
     JOIN hadith_toc ht ON ht.main_id = t2.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true
     JOIN books b ON b.id = ht.book_id
     LEFT JOIN isnad_hadiths ih2 ON ih2.hadith_id = t2.hadith_id
     LEFT JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id
     LEFT JOIN narrators comp ON comp.id = ic2.narrator_id_array[1] AND comp.is_companion = true
     WHERE t2.group_id = $1 AND t2.hadith_id != $2
     ORDER BY COALESCE(comp.id::text, t2.hadith_id::text), b.takhrij_death ASC NULLS LAST`,
    [groupId, hadithId]
  ).catch(() => ({ rows: [] as WitnessHadith[] }))

  const witnesses = witnessesRes.rows

  // Group by companion for a cleaner display
  const byCompanion = new Map<string, WitnessHadith[]>()
  for (const w of witnesses) {
    const key = w.companion_name || '— غير محدد الصحابي'
    if (!byCompanion.has(key)) byCompanion.set(key, [])
    byCompanion.get(key)!.push(w)
  }

  const uniqueCompanions = Array.from(byCompanion.keys())
  const hasSameCompanion = witnesses.some(w => !w.companion_id) // Some might be same companion

  return (
    <div dir="rtl">
      <div className="flex items-center gap-2 text-sm text-gray-500 mb-4 flex-wrap">
        <Link href="/books" className="hover:text-green-700">الكتب</Link>
        <span>›</span>
        <Link href={`/hadith/${hadithId}`} className="hover:text-green-700">الحديث {hadithId}</Link>
        <span>›</span>
        <span className="text-gray-700">الشواهد والمتابعات</span>
      </div>

      <h1 className="text-xl font-bold text-green-900 mb-1">الشواهد والمتابعات</h1>
      <p className="text-sm text-gray-600 line-clamp-2 mb-1">{stripTags(hadith.tarf).slice(0, 150)}</p>
      <p className="text-xs text-gray-400 mb-4">{hadith.book_title} — {hadith.takhrij_author}</p>

      <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 mb-4 text-xs text-blue-800">
        <span className="font-semibold">التعريف: </span>
        الشاهد هو حديث يُروى عن صحابي آخر بنفس معنى الحديث — يُستأنس به في الحكم على الأسانيد الأخرى.
        المتابعة هي رواية نفس الصحابي لكنها من طريق آخر. كلاهما يُستخدم لتقوية الحديث.
      </div>

      {witnesses.length === 0 ? (
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-8 text-center text-gray-500">
          لم يُعثر على شواهد أو متابعات لهذا الحديث
        </div>
      ) : (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <div className="bg-green-800 text-white rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{witnesses.length.toLocaleString('ar-EG')}</div>
              <div className="text-xs opacity-80">طريق موازٍ</div>
            </div>
            <div className="bg-amber-600 text-white rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{uniqueCompanions.length.toLocaleString('ar-EG')}</div>
              <div className="text-xs opacity-80">مجموعة</div>
            </div>
            <div className="bg-indigo-700 text-white rounded-xl p-3 text-center">
              <div className="text-xl font-bold">{groupId}</div>
              <div className="text-xs opacity-80">رقم المجموعة</div>
            </div>
          </div>

          {/* Grouped by companion */}
          <div className="space-y-5">
            {Array.from(byCompanion.entries()).map(([companionName, hadiths]) => (
              <div key={companionName}>
                <h2 className="text-sm font-bold text-green-900 mb-2 flex items-center gap-2">
                  {hadiths[0].companion_id ? (
                    <>
                      <span className="w-1 h-4 bg-amber-500 rounded-full inline-block" />
                      <Link href={`/narrator/${hadiths[0].companion_id}`}
                        className="hover:underline hover:text-green-700">
                        {companionName}
                      </Link>
                      <span className="text-xs font-normal text-gray-400">
                        ({hadiths.length} طريق)
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="w-1 h-4 bg-gray-400 rounded-full inline-block" />
                      <span className="text-gray-600">{companionName}</span>
                    </>
                  )}
                </h2>
                <div className="space-y-2 pr-3">
                  {hadiths.map(w => (
                    <Link key={w.hadith_id} href={`/hadith/${w.hadith_id}`}
                      className="block bg-white rounded-xl border border-gray-100 px-4 py-3 hover:border-green-200 hover:shadow-sm transition-all group">
                      <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                        <span className="text-xs text-green-700 font-medium">{w.book_title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {w.takhrij_author && (
                            <span className="text-xs text-gray-400">{w.takhrij_author}</span>
                          )}
                          {w.chain_count > 1 && (
                            <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                              {w.chain_count} سند
                            </span>
                          )}
                          {w.takhrij_death && (
                            <span className="text-xs text-gray-400">ت {w.takhrij_death}هـ</span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-gray-700 line-clamp-2 group-hover:text-green-900">
                        {stripTags(w.tarf).slice(0, 200) || '...'}
                      </p>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href={`/hadith/${hadithId}`} className="text-green-700 hover:underline">← الحديث</Link>
        <Link href={`/hadith/${hadithId}/all-narrators`} className="text-green-700 hover:underline">← جميع الرواة</Link>
        <Link href={`/hadith/${hadithId}/chain-analysis`} className="text-green-700 hover:underline">← تحليل الإسناد</Link>
        <Link href="/scholars/parallel-routes" className="text-green-700 hover:underline">← الشواهد والمتابعات العامة</Link>
      </div>
    </div>
  )
}
