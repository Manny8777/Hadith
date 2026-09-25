import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface MudalliNarrator {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  death_year_num: number | null
  grade: string | null
  city: string | null
  hadith_count: number
  chain_count: number
  book_count: number
  tadles_mentions: number
}

interface MudallisHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  chain_narrators: string[]
  judgment_text: string | null
}

export default async function MudallisCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || '0') || null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 15
  const offset = (page - 1) * pageSize

  const [muddallisRes, hadithsRes] = await Promise.all([
    pool.query<MudalliNarrator>(
      `SELECT DISTINCT
         n.id, n.name, n.abb_name, n.death_year, n.death_year_num, n.grade, n.city,
         COUNT(DISTINCT ih.hadith_id)::int AS hadith_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         (SELECT COUNT(*) FROM narrator_criticism nc
          WHERE nc.narrator_id = n.id
          AND nc.say_text ~* 'تدليس|مدلس|يدلس|دلّس') AS tadles_mentions
       FROM narrators n
       JOIN narrator_criticism nc ON nc.narrator_id = n.id
         AND nc.say_text ~* 'تدليس|مدلس|يدلس|دلّس'
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       GROUP BY n.id, n.name, n.abb_name, n.death_year, n.death_year_num, n.grade, n.city
       ORDER BY COUNT(DISTINCT ih.hadith_id) DESC
       LIMIT 30`,
      []
    ).catch(() => ({ rows: [] as MudalliNarrator[] })),

    selectedId ? pool.query<MudallisHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 200) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         ARRAY(SELECT n.name FROM unnest(ic.narrator_id_array) WITH ORDINALITY AS t(nid, ord)
               JOIN narrators n ON n.id = nid ORDER BY ord
               LIMIT 5) AS chain_narrators,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text
       FROM isnad_chains ic
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.main_id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE $1 = ANY(ic.narrator_id_array)
       ORDER BY ht.main_id
       LIMIT $2 OFFSET $3`,
      [selectedId, pageSize, offset]
    ).catch(() => ({ rows: [] as MudallisHadith[] })) : Promise.resolve({ rows: [] as MudallisHadith[] }),
  ])

  const mudalliseen = muddallisRes.rows
  const hadiths = hadithsRes.rows
  const selected = selectedId ? mudalliseen.find(m => m.id === selectedId) : null

  const maxHadiths = Math.max(...mudalliseen.map(m => m.hadith_count), 1)

  function gradeColor(g: string | null) {
    if (!g) return 'text-gray-400'
    if (/ثقة/.test(g)) return 'text-green-700'
    if (/صدوق/.test(g)) return 'text-blue-600'
    if (/ضعيف/.test(g)) return 'text-red-500'
    return 'text-gray-500'
  }

  function judgmentColor(j: string | null) {
    if (!j) return 'text-gray-400'
    if (/صحيح/.test(j)) return 'text-green-700'
    if (/حسن/.test(j)) return 'text-blue-600'
    if (/ضعيف/.test(j)) return 'text-red-500'
    return 'text-gray-500'
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس المدلِّسين من الرواة</h1>
        <p className="text-sm text-gray-500">
          رواة وردت في تراجمهم أحكام بالتدليس — يُعرَض لكل راوٍ أحاديثه التي هو في سندها لدراسة أثر التدليس على مروياته
        </p>
      </div>

      {mudalliseen.length === 0 && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-6 mb-5">
          <p className="text-sm text-amber-800">
            لم تُوجد بيانات الجرح والتعديل في قاعدة البيانات لهذا الاستعلام — تأكد من جدول narrator_criticism
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
            <div className="bg-red-50 px-4 py-2 border-b border-red-100 text-xs text-red-800 font-medium">
              المدلِّسون — بعدد أحاديثهم
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {mudalliseen.map((m, i) => (
                <a key={m.id}
                  href={`/narrators/mudallis-catalog?id=${m.id}`}
                  className={`px-3 py-2.5 flex items-center gap-2 hover:bg-red-50 transition-colors ${selectedId === m.id ? 'bg-red-50' : ''}`}>
                  <span className="text-xs text-gray-300 w-4 shrink-0">{(i + 1).toLocaleString('ar-EG')}</span>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm font-medium truncate ${selectedId === m.id ? 'text-red-900' : 'text-green-900'} hover:underline`}>
                      {m.abb_name || m.name.split(' ').slice(0, 3).join(' ')}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      {m.death_year && <span className="text-xs text-gray-400">ت {m.death_year}</span>}
                      {m.grade && <span className={`text-xs ${gradeColor(m.grade)}`}>{m.grade.slice(0, 10)}</span>}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <div className="flex-1 bg-gray-100 rounded-full h-1">
                        <div className="bg-red-400 h-1 rounded-full"
                          style={{ width: `${(m.hadith_count / maxHadiths) * 100}%` }} />
                      </div>
                      <span className="text-xs text-red-600 shrink-0">{m.hadith_count}</span>
                    </div>
                  </div>
                </a>
              ))}

              {mudalliseen.length === 0 && (
                <div className="p-6 text-center text-xs text-gray-400">
                  لا توجد بيانات — يتطلب جدول narrator_criticism
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          {selected ? (
            <>
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-bold text-red-900 text-base">{selected.name}</h2>
                    <div className="flex gap-3 mt-1 text-sm flex-wrap">
                      {selected.death_year && <span className="text-gray-500">ت {selected.death_year}</span>}
                      {selected.city && <span className="text-gray-500">{selected.city}</span>}
                      {selected.grade && <span className={gradeColor(selected.grade)}>{selected.grade}</span>}
                    </div>
                  </div>
                  <div className="text-left">
                    <div className="text-xl font-bold text-red-700">{selected.hadith_count.toLocaleString('ar-EG')}</div>
                    <div className="text-xs text-gray-400">حديث في سنده</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-4 text-sm flex-wrap">
                  <div><span className="font-medium">{selected.chain_count.toLocaleString('ar-EG')}</span> <span className="text-gray-500">سند</span></div>
                  <div><span className="font-medium">{selected.book_count.toLocaleString('ar-EG')}</span> <span className="text-gray-500">كتاب</span></div>
                  <div><span className="font-medium text-red-700">{String(selected.tadles_mentions)}</span> <span className="text-gray-500">إشارة تدليس</span></div>
                </div>
                <div className="mt-3 flex gap-3 text-xs">
                  <Link href={`/narrator/${selected.id}`} className="text-green-700 hover:underline">ترجمة كاملة ←</Link>
                  <Link href={`/narrator/${selected.id}/reliability`} className="text-blue-600 hover:underline">الموثوقية ←</Link>
                </div>
              </div>

              <div className="space-y-2">
                {hadiths.map(h => (
                  <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
                      <span className="text-xs text-gray-500">{h.book_name}</span>
                      {h.judgment_text && (
                        <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 30)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1 items-center mb-2">
                      {h.chain_narrators.map((name, ni) => (
                        <div key={ni} className="flex items-center gap-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${ni === 0 ? 'bg-amber-50 border-amber-100 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-600'}`}>
                            {name.split(' ')[0]}
                          </span>
                          {ni < h.chain_narrators.length - 1 && <span className="text-gray-200 text-xs">←</span>}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed mb-2">{h.hadith_text}...</p>
                    <Link href={`/hadith/${h.hadith_id}`} className="text-xs text-green-700 hover:underline">تفاصيل ←</Link>
                  </div>
                ))}
              </div>

              {(hadiths.length === pageSize || page > 1) && (
                <div className="flex gap-2 mt-4 justify-center">
                  {page > 1 && (
                    <a href={`/narrators/mudallis-catalog?id=${selectedId}&page=${page - 1}`}
                      className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg">← السابق</a>
                  )}
                  <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
                  {hadiths.length === pageSize && (
                    <a href={`/narrators/mudallis-catalog?id=${selectedId}&page=${page + 1}`}
                      className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg">التالي →</a>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="bg-gray-50 rounded-xl p-8 text-center">
              <p className="text-sm text-gray-400">اختر راوياً من القائمة لعرض أحاديثه وتفاصيل التدليس</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrator-types" className="text-green-700 hover:underline">← علل الإسناد</Link>
        <Link href="/hadiths/weakness-catalog" className="text-green-700 hover:underline">← فهرس الضعف</Link>
        <Link href="/narrators/severely-criticized" className="text-green-700 hover:underline">← المطعون فيهم</Link>
      </div>
    </div>
  )
}
