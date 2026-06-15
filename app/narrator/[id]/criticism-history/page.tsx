import { notFound } from 'next/navigation'
import Link from 'next/link'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

interface CriticismEntry {
  scientist_noun_id: number | null
  scientist_name: string
  say_text: string
  garh_label: string | null
  death_year_num: number | null
  death_year: string | null
  tabaqa: string | null
}

interface NarratorMeta {
  id: number
  name: string
  abb_name: string | null
  martaba_ibn_hajar: string | null
  death_year: string | null
}

function gradeColor(label: string | null) {
  if (!label) return { dot: 'bg-gray-300', text: 'text-gray-600', bg: 'bg-gray-50' }
  if (/ثقة|ثبت|حجة|إمام|صحابي/.test(label))
    return { dot: 'bg-green-500', text: 'text-green-800', bg: 'bg-green-50' }
  if (/صدوق|لا بأس|مقبول/.test(label))
    return { dot: 'bg-amber-400', text: 'text-amber-800', bg: 'bg-amber-50' }
  if (/ضعيف جداً|متروك|كذاب|موضوع/.test(label))
    return { dot: 'bg-red-700', text: 'text-red-900', bg: 'bg-red-50' }
  if (/ضعيف|منكر/.test(label))
    return { dot: 'bg-red-400', text: 'text-red-700', bg: 'bg-red-50' }
  return { dot: 'bg-gray-300', text: 'text-gray-600', bg: 'bg-gray-50' }
}

function centuryLabel(year: number | null) {
  if (!year) return 'غير مؤرَّخ'
  const c = Math.ceil(year / 100)
  const labels: Record<number, string> = {
    1: 'ق١', 2: 'ق٢', 3: 'ق٣', 4: 'ق٤', 5: 'ق٥',
    6: 'ق٦', 7: 'ق٧', 8: 'ق٨', 9: 'ق٩', 10: 'ق١٠',
  }
  return labels[c] || `ق${c}`
}

export default async function CriticismHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const narratorId = parseInt(id, 10)
  if (isNaN(narratorId)) notFound()

  const [metaRes, criticismRes, consensusRes] = await Promise.all([
    pool.query<NarratorMeta>(
      `SELECT id, name, abb_name, martaba_ibn_hajar, death_year
       FROM narrators WHERE id = $1`,
      [narratorId]
    ),

    pool.query<CriticismEntry>(
      `SELECT nc.say_text, nc.garh_label,
              nc.scientist_name,
              nc.scientist_noun_id,
              n.death_year_num, n.death_year, n.tabaqa
       FROM narrator_criticism nc
       LEFT JOIN narrators n ON n.id = nc.scientist_noun_id
       WHERE nc.narrator_id = $1
         AND nc.say_text IS NOT NULL AND nc.say_text != ''
       ORDER BY n.death_year_num ASC NULLS LAST, nc.say_sort`,
      [narratorId]
    ),

    pool.query<{ garh_label: string; cnt: number }>(
      `SELECT garh_label, COUNT(DISTINCT scientist_name)::int AS cnt
       FROM narrator_criticism
       WHERE narrator_id = $1 AND garh_label IS NOT NULL AND garh_label != ''
       GROUP BY garh_label
       ORDER BY cnt DESC`,
      [narratorId]
    ),
  ])

  if (metaRes.rows.length === 0) notFound()

  const narrator = metaRes.rows[0]
  const allEntries = criticismRes.rows
  const consensus = consensusRes.rows

  // Group by scientist then by century for the timeline view
  // Deduplicate: one entry per (scientist_name + say_text combo)
  const seen = new Set<string>()
  const entries: CriticismEntry[] = []
  for (const e of allEntries) {
    const key = `${e.scientist_name}||${e.say_text}`
    if (!seen.has(key)) {
      seen.add(key)
      entries.push(e)
    }
  }

  // Group by century
  const byCentury: Record<string, CriticismEntry[]> = {}
  for (const e of entries) {
    const c = centuryLabel(e.death_year_num)
    if (!byCentury[c]) byCentury[c] = []
    byCentury[c].push(e)
  }

  const centuries = Object.keys(byCentury)

  return (
    <div dir="rtl">
      <div className="mb-4">
        <Link href={`/narrator/${narratorId}`} className="text-sm text-green-700 hover:underline">
          ← العودة إلى ترجمة {narrator.abb_name || narrator.name}
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-green-900 mb-1">
        تسلسل الأحكام العلمية على {narrator.abb_name || narrator.name}
      </h1>
      <p className="text-sm text-gray-500 mb-4">
        أقوال المحدثين مرتبةً تصاعدياً بحسب وفياتهم — يكشف كيف تطور موقف العلماء من هذا الراوي عبر القرون
      </p>

      {/* Consensus bar */}
      {consensus.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
          <p className="text-xs text-gray-500 mb-2">توزيع أحكام العلماء</p>
          <div className="flex flex-wrap gap-2">
            {consensus.map(c => {
              const colors = gradeColor(c.garh_label)
              return (
                <div key={c.garh_label}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                  <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                  <span>{c.garh_label}</span>
                  <span className="opacity-60">({c.cnt})</span>
                </div>
              )
            })}
          </div>
          {narrator.martaba_ibn_hajar && (
            <p className="text-xs text-gray-500 mt-2">
              حكم ابن حجر المختار: <span className="font-semibold text-green-800">{narrator.martaba_ibn_hajar}</span>
            </p>
          )}
        </div>
      )}

      {entries.length === 0 && (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-8 text-center text-gray-500">
          لا توجد أحكام علمية مسجَّلة لهذا الراوي
        </div>
      )}

      {/* Research context */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-800">
        التسلسل الزمني لأحكام العلماء على الرواة أداة جوهرية في علم الرجال:
        قد تتغير الأحكام بين المتقدمين والمتأخرين، وقد يتشدد لاحقون أو يتساهلون.
        الراسخ في الجرح والتعديل ما اتفق عليه المتقدمون واطمأن إليه المتأخرون.
      </div>

      {/* Timeline by century */}
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute right-[11px] top-0 bottom-0 w-0.5 bg-gray-200 pointer-events-none" />

        <div className="space-y-6">
          {centuries.map(century => (
            <div key={century} className="relative">
              {/* Century marker */}
              <div className="flex items-center gap-3 mb-3">
                <div className="shrink-0 w-6 h-6 rounded-full bg-green-800 text-white text-xs flex items-center justify-center font-bold z-10 relative">
                  {century === 'غير مؤرَّخ' ? '؟' : century.replace('ق', '')}
                </div>
                <div className="font-semibold text-green-900 text-sm">
                  {century === 'غير مؤرَّخ' ? 'غير مؤرَّخ' : `القرن ${century.replace('ق', '')} الهجري`}
                </div>
                <div className="text-xs text-gray-400">
                  ({byCentury[century].length} رأي)
                </div>
              </div>

              <div className="mr-9 space-y-2">
                {byCentury[century].map((e, i) => {
                  const colors = gradeColor(e.garh_label)
                  return (
                    <div key={i} className={`rounded-xl border px-4 py-3 ${colors.bg}`}>
                      <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                        <div className="flex items-center gap-2">
                          {e.scientist_noun_id ? (
                            <Link href={`/narrator/${e.scientist_noun_id}`}
                              className={`text-sm font-semibold hover:underline ${colors.text}`}>
                              {e.scientist_name}
                            </Link>
                          ) : (
                            <span className={`text-sm font-semibold ${colors.text}`}>
                              {e.scientist_name}
                            </span>
                          )}
                          {e.death_year && (
                            <span className="text-xs text-gray-400">ت {e.death_year}هـ</span>
                          )}
                          {e.tabaqa && (
                            <span className="text-xs text-gray-400 opacity-70">{e.tabaqa}</span>
                          )}
                        </div>
                        {e.garh_label && (
                          <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${colors.text}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
                            {e.garh_label}
                          </div>
                        )}
                      </div>
                      <p className="text-sm text-gray-700 leading-relaxed">
                        {e.say_text}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-4 text-sm">
        <Link href={`/narrator/${narratorId}`} className="text-green-700 hover:underline">
          ← الترجمة الكاملة
        </Link>
        <Link href="/narrators/jarh-terms" className="text-green-700 hover:underline">
          ← مصطلحات الجرح والتعديل
        </Link>
      </div>
    </div>
  )
}
