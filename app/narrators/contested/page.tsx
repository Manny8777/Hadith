import pool from "@/lib/db"
import Link from "next/link"

export const dynamic = "force-dynamic"

interface ContestedNarrator {
  id: number
  name: string
  abb_name: string | null
  grade: string | null
  death_year: string | null
  city: string | null
  praise_count: number
  criticism_count: number
  total_critics: number
  hadith_count: number
}

interface CriticismDetail {
  scholar_name: string | null
  criticism_text: string
  is_praise: boolean
}

export default async function ContestedNarratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; sort?: string; minCritics?: string; limit?: string }>
}) {
  const sp = await searchParams
  const selectedId = parseInt(sp.id || "0") || null
  const sortBy = sp.sort || "score"
  const minCritics = parseInt(sp.minCritics || "3")
  const limit = parseInt(sp.limit || "30")

  const orderSql = sortBy === "critics" ? "total_critics DESC"
    : sortBy === "hadiths" ? "hadith_count DESC"
    : "controversy_score DESC"

  const [narratorsRes, detailRes] = await Promise.all([
    pool.query<ContestedNarrator & { controversy_score: number }>(
      `SELECT
         n.id, n.name, n.abb_name, n.grade, n.death_year, n.city,
         COUNT(*) FILTER (WHERE nc.say_text ~* 'ثقة|صدوق|حافظ|ضابط|محتج')::int AS praise_count,
         COUNT(*) FILTER (WHERE nc.say_text ~* 'ضعيف|متروك|منكر|كذاب|واهٍ|مطعون')::int AS criticism_count,
         COUNT(*)::int AS total_critics,
         COALESCE(stats.hadith_count, 0)::int AS hadith_count,
         (LEAST(
           COUNT(*) FILTER (WHERE nc.say_text ~* 'ثقة|صدوق|حافظ|ضابط|محتج'),
           COUNT(*) FILTER (WHERE nc.say_text ~* 'ضعيف|متروك|منكر|كذاب|واهٍ|مطعون')
         ) * 2 + COUNT(*))::int AS controversy_score
       FROM narrators n
       JOIN narrator_criticism nc ON nc.narrator_id = n.id
       LEFT JOIN (
         SELECT ic.narrator_id_array[1] AS nid, COUNT(DISTINCT ih.hadith_id)::int AS hadith_count
         FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
         GROUP BY ic.narrator_id_array[1]
       ) stats ON stats.nid = n.id
       WHERE NOT n.is_companion
       GROUP BY n.id, n.name, n.abb_name, n.grade, n.death_year, n.city, stats.hadith_count
       HAVING
         COUNT(*) FILTER (WHERE nc.say_text ~* 'ثقة|صدوق|حافظ|ضابط|محتج') >= 1
         AND COUNT(*) FILTER (WHERE nc.say_text ~* 'ضعيف|متروك|منكر|كذاب|واهٍ|مطعون') >= 1
         AND COUNT(*) >= $1
       ORDER BY ${orderSql}
       LIMIT $2`,
      [minCritics, limit]
    ).catch(() => ({ rows: [] as (ContestedNarrator & { controversy_score: number })[] })),

    selectedId ? pool.query<CriticismDetail>(
      `SELECT
         nc.scientist_name AS scholar_name,
         nc.say_text AS criticism_text,
         (nc.say_text ~* 'ثقة|صدوق|حافظ|ضابط|محتج' AND nc.say_text !~* 'ضعيف|متروك|منكر') AS is_praise
       FROM narrator_criticism nc
       WHERE nc.narrator_id = $1
       ORDER BY is_praise DESC, nc.scientist_name`,
      [selectedId]
    ).catch(() => ({ rows: [] as CriticismDetail[] })) : Promise.resolve({ rows: [] as CriticismDetail[] }),
  ])

  const narrators = narratorsRes.rows
  const details = detailRes.rows
  const selected = selectedId ? narrators.find(n => n.id === selectedId) : null

  const SORT_OPTIONS = [
    { key: "score", label: "درجة الخلاف" },
    { key: "critics", label: "عدد الناقدين" },
    { key: "hadiths", label: "عدد الأحاديث" },
  ]

  const MIN_CRITICS_OPTIONS = [2, 3, 4, 5]
  const LIMIT_OPTIONS = [20, 30, 50]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">المختلف فيهم — رواة مدحهم بعض العلماء وجرحهم آخرون</h1>
        <p className="text-sm text-gray-500">
          رواة اختلفت فيهم كلمة العلماء بين التوثيق والتجريح — أداة لبحث أعقد مسائل علم الجرح والتعديل ومناهج الموازنة بين الأقوال
        </p>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/narrators/contested?sort=${s.key}&minCritics=${minCritics}&limit=${limit}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? "bg-green-700 text-white border-green-700" : "bg-white text-gray-600 border-gray-200 hover:border-green-300"}`}>
            {s.label}
          </a>
        ))}
        <span className="text-gray-200">|</span>
        <span className="text-xs text-gray-500">الحد الأدنى:</span>
        {MIN_CRITICS_OPTIONS.map(m => (
          <a key={m}
            href={`/narrators/contested?sort=${sortBy}&minCritics=${m}&limit=${limit}`}
            className={`text-xs px-2.5 py-1 rounded-full border ${minCritics === m ? "bg-amber-600 text-white border-amber-600" : "bg-white text-gray-600 border-gray-200"}`}>
            {m}+
          </a>
        ))}
        <span className="text-gray-200">|</span>
        {LIMIT_OPTIONS.map(l => (
          <a key={l}
            href={`/narrators/contested?sort=${sortBy}&minCritics=${minCritics}&limit=${l}`}
            className={`text-xs px-2 py-0.5 rounded-full border ${limit === l ? "bg-indigo-700 text-white border-indigo-700" : "bg-white text-gray-600 border-gray-200"}`}>
            {l}
          </a>
        ))}
      </div>

      <div className="grid sm:grid-cols-5 gap-4">
        <div className="sm:col-span-3">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-amber-50 px-4 py-2 border-b border-amber-100 text-xs text-amber-800 font-medium flex justify-between">
              <span>المختلف فيهم</span>
              <div className="flex gap-3">
                <span className="text-green-600">■ تعديل</span>
                <span className="text-red-500">■ جرح</span>
              </div>
            </div>
            <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
              {narrators.map((n, i) => {
                const isSelected = selectedId === n.id
                const total = n.praise_count + n.criticism_count
                const praiseW = total > 0 ? Math.round((n.praise_count / total) * 100) : 50
                const critW = 100 - praiseW
                return (
                  <a key={n.id}
                    href={`/narrators/contested?id=${n.id}&sort=${sortBy}&minCritics=${minCritics}&limit=${limit}`}
                    className={`px-4 py-3 flex items-start gap-3 hover:bg-amber-50 transition-colors ${isSelected ? "bg-amber-50" : ""}`}>
                    <span className="text-xs text-gray-300 w-5 shrink-0 mt-0.5">{(i + 1).toLocaleString("ar-EG")}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-sm font-medium ${isSelected ? "text-amber-900" : "text-gray-800"} hover:underline`}>
                          {n.abb_name || n.name.split(" ").slice(0, 3).join(" ")}
                        </span>
                        {n.death_year && <span className="text-xs text-gray-400">ت {n.death_year}</span>}
                        {n.grade && <span className="text-xs text-gray-500">{n.grade.slice(0, 12)}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="flex rounded-full overflow-hidden h-2 w-24">
                          <div className="bg-green-400 h-2" style={{ width: `${praiseW}%` }} />
                          <div className="bg-red-400 h-2" style={{ width: `${critW}%` }} />
                        </div>
                        <span className="text-xs text-green-600">{n.praise_count}</span>
                        <span className="text-xs text-gray-300">/</span>
                        <span className="text-xs text-red-500">{n.criticism_count}</span>
                        <span className="text-xs text-gray-400 mr-1">({n.total_critics} ناقد)</span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 shrink-0">{n.hadith_count.toLocaleString("ar-EG")} ح</span>
                  </a>
                )
              })}
              {narrators.length === 0 && (
                <div className="p-8 text-center text-sm text-gray-400">
                  يتطلب هذا القسم جدول narrator_criticism في قاعدة البيانات
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sm:col-span-2">
          {selected && details.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden sticky top-20">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <h2 className="font-bold text-amber-900 text-sm">{selected.abb_name || selected.name}</h2>
                <div className="flex gap-2 text-xs mt-1 flex-wrap">
                  {selected.death_year && <span className="text-gray-500">ت {selected.death_year}</span>}
                  <span className="text-green-600">{selected.praise_count} مادح</span>
                  <span className="text-red-500">{selected.criticism_count} جارح</span>
                </div>
                <Link href={`/narrator/${selected.id}`} className="text-xs text-green-700 hover:underline mt-1 block">← الترجمة الكاملة</Link>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {[true, false].map(isPraise => {
                  const items = details.filter(d => d.is_praise === isPraise)
                  if (items.length === 0) return null
                  return (
                    <div key={String(isPraise)}>
                      <div className={`px-4 py-2 text-xs font-semibold ${isPraise ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>
                        {isPraise ? `التعديل (${items.length})` : `الجرح (${items.length})`}
                      </div>
                      {items.map((d, i) => (
                        <div key={i} className="px-4 py-2.5">
                          {d.scholar_name && <div className="text-xs font-medium text-gray-700 mb-0.5">{d.scholar_name}</div>}
                          <p className={`text-xs leading-relaxed ${isPraise ? "text-green-700" : "text-red-600"}`}>{d.criticism_text.slice(0, 150)}</p>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-6 text-center">
              <div className="text-2xl mb-2">⚖️</div>
              <div className="font-semibold text-amber-900 text-sm mb-2">الجرح والتعديل المتعارض</div>
              <p className="text-xs text-amber-700 leading-relaxed">اختر راوياً لمشاهدة أقوال علماء الجرح والتعديل فيه</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/narrators/mudallis-catalog" className="text-green-700 hover:underline">← المدلِّسون</Link>
        <Link href="/hadiths/divergent-judgments" className="text-green-700 hover:underline">← اختلاف العلماء</Link>
        <Link href="/narrators" className="text-green-700 hover:underline">← الرواة</Link>
      </div>
    </div>
  )
}
