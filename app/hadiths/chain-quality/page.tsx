import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

interface QualityHadith {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  chain_count: number
  all_thiqa_chains: number
  has_daif: boolean
  companion_name: string | null
  judgment_text: string | null
  avg_chain_length: number
}

const QUALITY_PRESETS = [
  {
    key: 'all_thiqa',
    label: 'كل رواته ثقات',
    desc: 'أحاديث لا يوجد في أي سند من أسانيدها راوٍ ضعيف',
    color: 'bg-green-100 text-green-800 border-green-200',
  },
  {
    key: 'no_daif',
    label: 'خالٍ من الضعفاء',
    desc: 'أحاديث لم يُصنَّف أي راوٍ في أسانيدها بالضعف',
    color: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    key: 'multi_chain',
    label: 'متعدد الأسانيد (5+)',
    desc: 'أحاديث رُويت من خمسة أسانيد مستقلة أو أكثر',
    color: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    key: 'short_chain',
    label: 'قصير السند (≤4 رواة)',
    desc: 'أحاديث بأسانيد لا تتجاوز 4 رواة من الصحابي إلى المصنِّف',
    color: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    key: 'multi_companion',
    label: 'متعدد الصحابة',
    desc: 'أحاديث رُويت من صحابيَّين أو أكثر — أقوى دلالةً على الاتفاق',
    color: 'bg-teal-100 text-teal-800 border-teal-200',
  },
]

export default async function ChainQualityPage({
  searchParams,
}: {
  searchParams: Promise<{ preset?: string; book?: string; page?: string }>
}) {
  const sp = await searchParams
  const preset = sp.preset || 'all_thiqa'
  const bookFilter = sp.book || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const selectedPreset = QUALITY_PRESETS.find(p => p.key === preset) || QUALITY_PRESETS[0]

  let whereSql = ''
  let havingSql = ''

  if (preset === 'all_thiqa') {
    whereSql = `AND NOT EXISTS (
      SELECT 1 FROM isnad_hadiths ih2
      JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id AND ih2.hadith_id = ht.main_id
      JOIN LATERAL unnest(ic2.narrator_id_array) AS un(nid) ON true
      JOIN narrators n2 ON n2.id = un.nid AND n2.is_companion = false
      WHERE n2.martaba_ibn_hajar ~* 'ضعيف|متروك|كذاب|واهٍ'
    )`
  } else if (preset === 'no_daif') {
    whereSql = `AND NOT EXISTS (
      SELECT 1 FROM isnad_hadiths ih2
      JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id AND ih2.hadith_id = ht.main_id
      JOIN LATERAL unnest(ic2.narrator_id_array) AS un(nid) ON true
      JOIN narrators n2 ON n2.id = un.nid
      WHERE n2.martaba_ibn_hajar ~* 'ضعيف'
    )`
  } else if (preset === 'multi_chain') {
    havingSql = 'HAVING COUNT(DISTINCT ic.id) >= 5'
  } else if (preset === 'short_chain') {
    whereSql = `AND EXISTS (
      SELECT 1 FROM isnad_hadiths ih2
      JOIN isnad_chains ic2 ON ic2.id = ih2.isnad_id AND ih2.hadith_id = ht.main_id
      WHERE array_length(ic2.narrator_id_array, 1) <= 4
    )`
  } else if (preset === 'multi_companion') {
    havingSql = `HAVING COUNT(DISTINCT ic.narrator_id_array[1]) FILTER (
      WHERE (SELECT n3.is_companion FROM narrators n3 WHERE n3.id = ic.narrator_id_array[1])
    ) >= 2`
  }

  const [haditshRes, booksRes] = await Promise.all([
    pool.query<QualityHadith>(
      `SELECT
         ht.main_id AS hadith_id,
         LEFT(ht.tarf, 220) AS hadith_text,
         b.title AS book_name,
         ht.chapter_text AS chapter_name,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         COUNT(DISTINCT ic.id) FILTER (WHERE NOT EXISTS (
           SELECT 1 FROM unnest(ic.narrator_id_array) AS un(nid)
           JOIN narrators n4 ON n4.id = un.nid AND n4.is_companion = false
           WHERE n4.martaba_ibn_hajar ~* 'ضعيف'
         ))::int AS all_thiqa_chains,
         BOOL_OR(EXISTS (
           SELECT 1 FROM unnest(ic.narrator_id_array) AS un(nid)
           JOIN narrators n5 ON n5.id = un.nid
           WHERE n5.martaba_ibn_hajar ~* 'ضعيف'
         )) AS has_daif,
         (SELECT n6.name FROM narrators n6 WHERE n6.id = ic.narrator_id_array[1] AND n6.is_companion = true LIMIT 1) AS companion_name,
         (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
         ROUND(AVG(array_length(ic.narrator_id_array, 1)), 1)::numeric(4,1) AS avg_chain_length
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       JOIN isnad_chains ic ON ic.id = ih.isnad_id
       WHERE ($1 = '' OR b.title ~* $1)
       ${whereSql}
       GROUP BY ht.main_id, ht.tarf, b.title, ht.chapter_text, ic.narrator_id_array
       ${havingSql}
       ORDER BY chain_count DESC, ht.main_id
       LIMIT $2 OFFSET $3`,
      [bookFilter || '', pageSize, offset]
    ).catch(() => ({ rows: [] as QualityHadith[] })),

    pool.query<{ name: string }>(
      `SELECT DISTINCT b.title AS name FROM books b
       JOIN hadith_toc ht ON ht.book_id = b.id
       JOIN isnad_hadiths ih ON ih.hadith_id = ht.main_id
       ORDER BY b.title LIMIT 60`
    ).catch(() => ({ rows: [] as { name: string }[] })),
  ])

  const hadiths = haditshRes.rows
  const books = booksRes.rows

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
        <h1 className="text-2xl font-bold text-green-900 mb-1">فلتر جودة الأسانيد</h1>
        <p className="text-sm text-gray-500">
          ابحث عن الأحاديث بمعايير نوعية في أسانيدها — لتحديد أعلاها إسناداً وأوثقها رواةً وأكثرها تعدداً في الطرق
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        {QUALITY_PRESETS.map(p => (
          <a key={p.key}
            href={`/hadiths/chain-quality?preset=${p.key}&book=${bookFilter}`}
            className={`border-2 rounded-xl px-4 py-3 transition-all hover:shadow-sm ${preset === p.key ? p.color + ' ring-2 ring-offset-1 ring-green-400' : p.color + ' opacity-70 hover:opacity-100'}`}>
            <div className="font-semibold text-sm mb-1">{p.label}</div>
            <div className="text-xs opacity-70">{p.desc}</div>
          </a>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap items-center">
        <select defaultValue={bookFilter}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 text-gray-700 bg-white">
          <option value="">كل الكتب</option>
          {books.map(bk => (
            <option key={bk.name} value={bk.name}>{bk.name}</option>
          ))}
        </select>
        {bookFilter && (
          <a href={`/hadiths/chain-quality?preset=${preset}`} className="text-xs text-red-500 hover:underline">× إزالة فلتر الكتاب</a>
        )}
      </div>

      <div className="space-y-3">
        {hadiths.map(h => (
          <div key={h.hadith_id} className="bg-white rounded-xl border border-gray-100 p-4 hover:border-green-200 transition-all">
            <div className="flex items-center gap-2 mb-2 flex-wrap text-xs">
              <span className="text-gray-500">{h.book_name}</span>
              {h.chapter_name && <span className="text-gray-400">· {h.chapter_name}</span>}
              {h.companion_name && (
                <span className="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full">
                  {h.companion_name.split(' ').slice(0, 2).join(' ')}
                </span>
              )}
              {h.judgment_text && (
                <span className={judgmentColor(h.judgment_text)}>{h.judgment_text.slice(0, 20)}</span>
              )}
              <span className="text-gray-300 mr-auto">{h.chain_count} سند</span>
              <span className="text-indigo-600">~{h.avg_chain_length} راوٍ</span>
            </div>
            <p className="text-sm text-gray-900 leading-relaxed mb-2">{h.hadith_text}...</p>
            <div className="flex gap-3 text-xs">
              <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
              <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
              <Link href={`/hadith/${h.hadith_id}/chain-diversity`} className="text-indigo-600 hover:underline">تنوع السند ←</Link>
            </div>
          </div>
        ))}

        {hadiths.length === 0 && (
          <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
            لا توجد أحاديث تحقق هذا المعيار بالفلاتر الحالية
          </div>
        )}
      </div>

      {(hadiths.length === pageSize || page > 1) && (
        <div className="flex gap-2 mt-5 justify-center">
          {page > 1 && (
            <a href={`/hadiths/chain-quality?preset=${preset}&book=${bookFilter}&page=${page - 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">← السابق</a>
          )}
          <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
          {hadiths.length === pageSize && (
            <a href={`/hadiths/chain-quality?preset=${preset}&book=${bookFilter}&page=${page + 1}`}
              className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-green-300">التالي →</a>
          )}
        </div>
      )}

      <div className="mt-5 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/chain-diversity" className="text-green-700 hover:underline">← تنوع الأسانيد</Link>
        <Link href="/hadiths/narrator-bottleneck" className="text-green-700 hover:underline">← الرواة الفردية</Link>
        <Link href="/narrators/short-chains" className="text-green-700 hover:underline">← الأسانيد العالية</Link>
      </div>
    </div>
  )
}
