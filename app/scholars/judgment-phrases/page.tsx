import pool from '@/lib/db'
import Link from 'next/link'
import UiIcon from '@/app/components/UiIcon'

export const dynamic = 'force-dynamic'

interface ScholarSummary {
  scholar_name: string
  total_judgments: number
  sahih_count: number
  daif_count: number
  unique_phrases: number
  top_phrase: string | null
}

interface PhraseEntry {
  judgment_text: string
  count: number
}

export default async function JudgmentPhrasesPage({
  searchParams,
}: {
  searchParams: Promise<{ scholar?: string; q?: string; sort?: string }>
}) {
  const sp = await searchParams
  const selectedScholar = sp.scholar || ''
  const q = sp.q || ''
  const sortBy = sp.sort || 'total'

  const orderSql = sortBy === 'sahih' ? 'sahih_count DESC'
    : sortBy === 'daif' ? 'daif_count DESC'
    : sortBy === 'phrases' ? 'unique_phrases DESC'
    : 'total_judgments DESC'

  const [scholarsRes, phrasesRes] = await Promise.all([
    pool.query<ScholarSummary>(
      `SELECT
         n.name AS scholar_name,
         COUNT(*)::int AS total_judgments,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'صحيح')::int AS sahih_count,
         COUNT(*) FILTER (WHERE hj.say_text ~* 'ضعيف|موضوع|منكر|باطل')::int AS daif_count,
         COUNT(DISTINCT hj.say_text)::int AS unique_phrases,
         (SELECT hj2.say_text FROM hadith_judgments hj2
          WHERE hj2.scientist_id = hj.scientist_id
          GROUP BY hj2.say_text ORDER BY COUNT(*) DESC LIMIT 1) AS top_phrase
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE ($1 = '' OR n.name ~* $1)
       GROUP BY hj.scientist_id, n.name
       HAVING COUNT(*) >= 5
       ORDER BY ${orderSql}
       LIMIT 50`,
      [q || '']
    ).catch(() => ({ rows: [] as ScholarSummary[] })),

    selectedScholar ? pool.query<PhraseEntry>(
      `SELECT
         hj.say_text AS judgment_text,
         COUNT(*)::int AS count
       FROM hadith_judgments hj
       JOIN narrators n ON n.id = hj.scientist_id
       WHERE n.name = $1
       GROUP BY hj.say_text
       ORDER BY COUNT(*) DESC
       LIMIT 40`,
      [selectedScholar]
    ).catch(() => ({ rows: [] as PhraseEntry[] })) : Promise.resolve({ rows: [] as PhraseEntry[] }),
  ])

  const scholars = scholarsRes.rows
  const phrases = phrasesRes.rows
  const selected = scholars.find(s => s.scholar_name === selectedScholar)

  const maxJudgments = Math.max(...scholars.map(s => s.total_judgments), 1)

  function phraseCategory(text: string) {
    if (/صحيح الإسناد|صحيح على شرط/.test(text)) return 'sahih-strict'
    if (/صحيح/.test(text)) return 'sahih'
    if (/حسن/.test(text) && !/صحيح/.test(text)) return 'hasan'
    if (/ضعيف الإسناد|ضعيف جداً|ضعيف كثيراً/.test(text)) return 'daif-severe'
    if (/ضعيف/.test(text)) return 'daif'
    if (/موضوع|باطل|مكذوب/.test(text)) return 'mawdu'
    if (/منكر|شاذ/.test(text)) return 'munkar'
    if (/مرسل|منقطع|معضل/.test(text)) return 'mursal'
    return 'other'
  }

  const phraseColors: Record<string, string> = {
    'sahih-strict': 'bg-green-700 text-white',
    'sahih': 'bg-green-100 text-green-800 border border-green-200',
    'hasan': 'bg-blue-100 text-blue-800 border border-blue-200',
    'daif': 'bg-red-100 text-red-800 border border-red-200',
    'daif-severe': 'bg-red-700 text-white',
    'mawdu': 'bg-gray-800 text-white',
    'munkar': 'bg-orange-100 text-orange-800 border border-orange-200',
    'mursal': 'bg-purple-100 text-purple-800 border border-purple-200',
    'other': 'bg-gray-100 text-gray-600 border border-gray-200',
  }

  const SORT_OPTIONS = [
    { key: 'total', label: 'بعدد الأحكام' },
    { key: 'sahih', label: 'أكثر تصحيحاً' },
    { key: 'daif', label: 'أكثر تضعيفاً' },
    { key: 'phrases', label: 'أغنى بالصيغ' },
  ]

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">معجم صيغ الحكم عند العلماء</h1>
        <p className="text-sm text-gray-500">
          الصيغ التي استخدمها كل عالم في الحكم على الأحاديث — يكشف المنهج النقدي لكل محدِّث وطريقته في التعبير عن التصحيح والتضعيف
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-3 mb-4">
        <form method="get" action="/scholars/judgment-phrases" className="flex gap-2">
          <input type="text" name="q" defaultValue={q}
            placeholder="ابحث عن عالم..."
            className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-400" dir="rtl" />
          <button type="submit" className="bg-green-700 text-white text-sm px-4 py-2 rounded-lg hover:bg-green-800">بحث</button>
          {q && <a href="/scholars/judgment-phrases" className="text-sm border border-gray-200 px-3 py-2 rounded-lg text-gray-400">✕</a>}
        </form>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {SORT_OPTIONS.map(s => (
          <a key={s.key}
            href={`/scholars/judgment-phrases?sort=${s.key}${selectedScholar ? `&scholar=${encodeURIComponent(selectedScholar)}` : ''}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${sortBy === s.key ? 'bg-green-700 text-white border-green-700' : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'}`}>
            {s.label}
          </a>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
        <div className="sm:col-span-2">
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="bg-green-50 px-4 py-2 border-b border-green-100 text-xs text-green-800 font-medium">
              العلماء — {SORT_OPTIONS.find(s => s.key === sortBy)?.label}
            </div>
            <div className="divide-y divide-gray-50 max-h-[70vh] overflow-y-auto">
              {scholars.map((sc, i) => {
                const barW = Math.round((sc.total_judgments / maxJudgments) * 100)
                const isSelected = selectedScholar === sc.scholar_name
                return (
                  <a key={sc.scholar_name}
                    href={`/scholars/judgment-phrases?scholar=${encodeURIComponent(sc.scholar_name)}&sort=${sortBy}`}
                    className={`px-4 py-3 flex items-start gap-2 hover:bg-green-50 transition-colors ${isSelected ? 'bg-green-50' : ''}`}>
                    <span className="text-xs text-gray-300 w-4 shrink-0 mt-0.5">{(i + 1).toLocaleString('ar-EG')}</span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${isSelected ? 'text-green-900' : 'text-gray-800'} hover:underline`}>
                        {sc.scholar_name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-24">
                          <div className="bg-green-400 h-1.5 rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="text-xs text-gray-500">{sc.total_judgments}</span>
                        <span className="text-xs text-green-600">{sc.sahih_count}ص</span>
                        <span className="text-xs text-red-500">{sc.daif_count}ض</span>
                      </div>
                      {sc.top_phrase && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{sc.top_phrase.slice(0, 30)}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-300 shrink-0">{sc.unique_phrases} صيغة</span>
                  </a>
                )
              })}
            </div>
          </div>
        </div>

        <div className="sm:col-span-3">
          {selected && phrases.length > 0 ? (
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="bg-amber-50 px-4 py-3 border-b border-amber-100">
                <h2 className="font-bold text-amber-900 text-sm">{selected.scholar_name}</h2>
                <div className="flex gap-3 text-xs text-amber-700 mt-1">
                  <span>{selected.total_judgments} حكم</span>
                  <span>{selected.unique_phrases} صيغة مختلفة</span>
                  <span className="text-green-700">{selected.sahih_count} تصحيح</span>
                  <span className="text-red-600">{selected.daif_count} تضعيف</span>
                </div>
              </div>
              <div className="p-4 max-h-[65vh] overflow-y-auto">
                <div className="flex flex-wrap gap-2">
                  {phrases.map((p, i) => {
                    const cat = phraseCategory(p.judgment_text)
                    return (
                      <div key={i}
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs ${phraseColors[cat]}`}>
                        <span>{p.judgment_text}</span>
                        <span className="opacity-60 font-medium">{p.count}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 rounded-xl border border-amber-100 p-8 text-center">
              <UiIcon name="quote" size={32} className="text-[#b28a43] mb-3" />
              <div className="font-semibold text-amber-900 text-sm mb-2">معجم الصيغ النقدية</div>
              <p className="text-xs text-amber-700 leading-relaxed">
                اختر عالماً لاستعراض كل الصيغ التي استخدمها في الحكم على الأحاديث، مصنَّفةً بين التصحيح والتحسين والتضعيف والوضع
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-green-700">صحيح الإسناد</div>
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-blue-600">حسن لغيره</div>
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-red-500">ضعيف جداً</div>
                <div className="bg-white rounded-lg px-3 py-2 border border-amber-100 text-gray-700">لا أصل له</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/scholars/isnad-criteria" className="text-green-700 hover:underline">← معايير العلماء</Link>
        <Link href="/hadiths/divergent-judgments" className="text-green-700 hover:underline">← اختلاف العلماء</Link>
        <Link href="/hadiths/grade-evolution" className="text-green-700 hover:underline">← تطور التصحيح</Link>
      </div>
    </div>
  )
}
