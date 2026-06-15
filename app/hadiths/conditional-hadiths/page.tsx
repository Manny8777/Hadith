import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface ConditionalHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  judgment_text: string | null
  chain_count: number
  cond_type: string
}

const CONDITIONAL_TYPES = [
  { key: 'reward', label: 'حديث الثواب (من ... فله)', pattern: 'من.*فله|من.*له.*أجر|من.*كان له|من.*غفر', color: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'warning', label: 'حديث التحذير (لا يدخل / من فعل)', pattern: 'لا يدخل الجنة|لا يؤمن|من ذبح|من قتل|من غش|لعن|ملعون', color: 'bg-red-100 text-red-800 border-red-200' },
  { key: 'condition', label: 'حديث الشرط (إذا ... فـ)', pattern: 'إذا.*فـ|إذا.*فله|إذا.*يجب|إذا.*حق|إذا.*كان', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'prohibition', label: 'النهي (لا تفعل)', pattern: 'لا تبع|لا تأكل|لا تضرب|لا تسبوا|لا تحقر|لا تغضب|نهى عن', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { key: 'command', label: 'الأمر (افعل)', pattern: 'أمر.*بـ|ائتوا|افعلوا|أقيموا|آتوا|توضأوا|صوموا', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { key: 'definition', label: 'التعريف (الـ هو)', pattern: 'المسلم من|المؤمن من|الإسلام أن|الإيمان أن|الصلاة من', color: 'bg-violet-100 text-violet-800 border-violet-200' },
]

export default async function ConditionalHadithsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string; grade?: string }>
}) {
  const sp = await searchParams
  const selectedType = sp.type || 'reward'
  const gradeFilter = sp.grade || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const selectedCondType = CONDITIONAL_TYPES.find(t => t.key === selectedType) || CONDITIONAL_TYPES[0]

  const gradeSql = gradeFilter === 'sahih' ? `AND hj.say_text ~* '^صحيح|إسناده صحيح'`
    : gradeFilter === 'daif' ? `AND hj.say_text ~* '^ضعيف|إسناده ضعيف'`
    : ''

  const [countsRes, haditshRes] = await Promise.all([
    pool.query<{ cond_type: string; count: number }>(
      `SELECT unnested.cond_type, COUNT(DISTINCT ht.main_id)::int AS count
       FROM hadith_toc ht,
       (VALUES
         ('reward', $1), ('warning', $2), ('condition', $3),
         ('prohibition', $4), ('command', $5), ('definition', $6)
       ) AS unnested(cond_type, pattern)
       WHERE ht.tarf ~* unnested.pattern
       GROUP BY unnested.cond_type`,
      CONDITIONAL_TYPES.map(t => t.pattern)
    ).catch(() => ({ rows: [] })),

    pool.query<ConditionalHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 230) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id ${gradeSql} LIMIT 1) AS judgment_text,
         (SELECT COUNT(DISTINCT ic.id)::int FROM isnad_chains ic
          JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ih.hadith_id = ht.main_id) AS chain_count,
         $1 AS cond_type
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.tarf ~* $2
       ${gradeSql ? `AND EXISTS (SELECT 1 FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id ${gradeSql})` : ''}
       ORDER BY ht.main_id
       LIMIT $3 OFFSET $4`,
      [selectedCondType.key, selectedCondType.pattern, pageSize, offset]
    ).catch(() => ({ rows: [] as ConditionalHadith[] })),
  ])

  const counts: Record<string, number> = {}
  countsRes.rows.forEach((r: { cond_type: string; count: number }) => { counts[r.cond_type] = r.count })
  const hadiths = haditshRes.rows

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
        <h1 className="text-2xl font-bold text-green-900 mb-1">أحاديث الأحكام — التصنيف الأسلوبي</h1>
        <p className="text-sm text-gray-500">
          تصنيف الأحاديث بأسلوبها اللغوي: أحاديث الثواب، التحذير، الشرط، النهي، الأمر، والتعريف — أداة لدراسة أساليب التشريع النبوي
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
        {CONDITIONAL_TYPES.map(t => {
          const count = counts[t.key] || 0
          return (
            <a key={t.key}
              href={`/hadiths/conditional-hadiths?type=${t.key}&grade=${gradeFilter}`}
              className={`border-2 rounded-xl px-4 py-3 transition-all hover:shadow-sm ${selectedType === t.key ? t.color + ' ring-2 ring-offset-1 ring-green-400' : t.color + ' opacity-80 hover:opacity-100'}`}>
              <div className="font-semibold text-sm mb-1">{t.label}</div>
              <div className="text-lg font-bold">{count.toLocaleString('ar-EG')}</div>
              <div className="text-xs opacity-70">حديث</div>
            </a>
          )
        })}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <span className="text-xs text-gray-500">تصفية بالدرجة:</span>
        {[{ key: '', label: 'الكل' }, { key: 'sahih', label: 'الصحيح فقط' }, { key: 'daif', label: 'الضعيف فقط' }].map(g => (
          <a key={g.key}
            href={`/hadiths/conditional-hadiths?type=${selectedType}&grade=${g.key}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${gradeFilter === g.key ? 'bg-indigo-700 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200'}`}>
            {g.label}
          </a>
        ))}
      </div>

      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {h.chapter_name && <span className="text-xs text-gray-400">{h.chapter_name}</span>}
              <span className="text-xs text-gray-500">{h.book_name}</span>
              {h.judgment_text && (
                <span className={`text-xs ${judgmentColor(h.judgment_text)}`}>{h.judgment_text.slice(0, 30)}</span>
              )}
              <span className="text-xs text-gray-400 mr-auto">{h.chain_count} سند</span>
            </div>
            <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
            <div className="flex gap-3 text-xs">
              <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
              <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
              <Link href={`/hadith/${h.hadith_id}/transmission-history`} className="text-amber-600 hover:underline">تاريخ الانتقال ←</Link>
            </div>
          </div>
        ))}

        {hadiths.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
            لا توجد أحاديث لهذه المعايير
          </div>
        )}
      </div>

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/conditional-hadiths?type=${selectedType}&grade=${gradeFilter}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/conditional-hadiths?type=${selectedType}&grade=${gradeFilter}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/matn-keywords" className="text-green-700 hover:underline">← الأحاديث الموضوعية</Link>
        <Link href="/hadiths/fiqh-map" className="text-green-700 hover:underline">← خريطة الفقه</Link>
        <Link href="/hadiths/advanced-research" className="text-green-700 hover:underline">← البحث المتقدم</Link>
      </div>
    </div>
  )
}
