import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface CommandHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  judgment_text: string | null
  chain_count: number
  command_type: string
  companion_name: string | null
}

interface CommandStats {
  command_type: string
  count: number
}

const COMMAND_TYPES = [
  { key: 'amar', label: 'أمر النبي ﷺ', pattern: 'أمر النبي|أمرنا النبي|أمرنا رسول الله|أمر رسول الله', color: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'naha', label: 'نهى النبي ﷺ', pattern: 'نهى النبي|نهانا النبي|نهانا رسول الله|نهى رسول الله', color: 'bg-red-100 text-red-800 border-red-200' },
  { key: 'qala_amar', label: 'قال افعل / لا تفعل', pattern: 'قال.*افعلوا|قال.*لا تفعل|قال.*أقيموا|قال.*اتقوا|فقال.*افعل', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { key: 'kana', label: 'كان يفعل (سنة فعلية)', pattern: 'كان.*يصلي|كان.*يصوم|كان.*يقرأ|كان.*يقول|كان.*يتوضأ|كان.*يأمر', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'wajib', label: 'الواجب والفريضة', pattern: 'فريضة|واجب|وجب|أُمرنا|افترض|افترضت|فُرض', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { key: 'sunna', label: 'السنة والمستحب', pattern: 'سنة|يستحب|من السنة|فضل|يُستحب|مستحب', color: 'bg-teal-100 text-teal-800 border-teal-200' },
]

export default async function PropheticCommandsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; topic?: string }>
}) {
  const sp = await searchParams
  const selectedType = sp.type || 'amar'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const selectedCommandType = COMMAND_TYPES.find(t => t.key === selectedType) || COMMAND_TYPES[0]

  const [statsRes, haditshRes] = await Promise.all([
    pool.query<CommandStats>(
      `SELECT unnested.cmd_type AS command_type, COUNT(DISTINCT ht.main_id)::int AS count
       FROM hadith_toc ht,
       (VALUES
         ('amar', $1), ('naha', $2), ('qala_amar', $3),
         ('kana', $4), ('wajib', $5), ('sunna', $6)
       ) AS unnested(cmd_type, pattern)
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.tarf ~* unnested.pattern
       GROUP BY unnested.cmd_type`,
      COMMAND_TYPES.map(t => t.pattern)
    ).catch(() => ({ rows: [] as CommandStats[] })),

    pool.query<CommandHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g'), 230) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
         $1 AS command_type,
         (SELECT n.name FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id AND ih.hadith_id = ht.main_id
          JOIN narrators n ON n.id = ic.narrator_id_array[1] AND n.is_companion = true LIMIT 1) AS companion_name
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.tarf ~* $2
       ORDER BY ht.main_id
       LIMIT $3 OFFSET $4`,
      [selectedCommandType.key, selectedCommandType.pattern, pageSize, offset]
    ).catch(() => ({ rows: [] as CommandHadith[] })),
  ])

  const stats = statsRes.rows
  const hadiths = haditshRes.rows

  const countMap: Record<string, number> = {}
  stats.forEach(s => { countMap[s.command_type] = s.count })

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
        <h1 className="text-2xl font-bold text-green-900 mb-1">الأوامر والنواهي النبوية — دراسة أسلوبية</h1>
        <p className="text-sm text-gray-500">
          استخراج أحاديث الأوامر والنواهي الصريحة وأحاديث الفعل النبوي — أداة لدراسة مصادر الأحكام الشرعية وأسلوب التشريع النبوي
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {COMMAND_TYPES.map(t => (
          <a key={t.key}
            href={`/hadiths/prophetic-commands?type=${t.key}`}
            className={`border-2 rounded-xl px-4 py-3 transition-all hover:shadow-sm ${selectedType === t.key ? t.color + ' ring-2 ring-offset-1 ring-green-400' : t.color + ' opacity-80 hover:opacity-100'}`}>
            <div className="font-semibold text-sm mb-1">{t.label}</div>
            <div className="text-xl font-bold">{(countMap[t.key] || 0).toLocaleString('ar-EG')}</div>
            <div className="text-xs opacity-70">حديث</div>
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
              <span className="text-xs text-gray-500">{h.book_name}</span>
              {h.companion_name && (
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                  {h.companion_name.split(' ').slice(0, 2).join(' ')}
                </span>
              )}
              {h.judgment_text && (
                <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 30)}</span>
              )}
              <span className="text-xs text-gray-300 mr-auto">{h.chain_count} سند</span>
            </div>
            <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
            <div className="flex gap-3 text-xs">
              <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
              <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
            </div>
          </div>
        ))}

        {hadiths.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
            لا توجد أحاديث لهذا النوع
          </div>
        )}
      </div>

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/prophetic-commands?type=${selectedType}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/prophetic-commands?type=${selectedType}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/conditional-hadiths" className="text-green-700 hover:underline">← أحاديث الأساليب</Link>
        <Link href="/hadiths/fiqh-map" className="text-green-700 hover:underline">← خريطة الفقه</Link>
        <Link href="/hadiths/matn-keywords" className="text-green-700 hover:underline">← الأحاديث الموضوعية</Link>
      </div>
    </div>
  )
}
