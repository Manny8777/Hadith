import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس أنواع الضعف — جامع خادم الحرمين' }

const WEAKNESS_TYPES = [
  {
    key: 'inqita',
    label: 'الانقطاع',
    desc: 'سقوط راوٍ من الإسناد في مواضع متفرقة',
    pattern: 'منقطع|انقطاع|فيه انقطاع',
    color: 'red',
  },
  {
    key: 'irsal',
    label: 'الإرسال',
    desc: 'رواية التابعي عن النبي ﷺ مباشرةً دون واسطة صحابي',
    pattern: 'مرسل|فيه إرسال|إرساله',
    color: 'orange',
  },
  {
    key: 'daif_rawi',
    label: 'ضعف الراوي',
    desc: 'في إسناده راوٍ ضعيف أو متكلَّم فيه',
    pattern: 'فيه فلان|في إسناده|أحد رواته|راوٍ ضعيف|سنده ضعيف|إسناده ضعيف',
    color: 'rose',
  },
  {
    key: 'iztiraab',
    label: 'الاضطراب',
    desc: 'اختلاف الرواة في ضبط متن الحديث أو سنده',
    pattern: 'مضطرب|اضطراب|مختلف في',
    color: 'purple',
  },
  {
    key: 'tadlis',
    label: 'التدليس',
    desc: 'إخفاء الراوي حال شيخه أو عنعنة المدلِّس',
    pattern: 'مدلَّس|تدليس|عنعن|يُدلِّس',
    color: 'indigo',
  },
  {
    key: 'shudhudh',
    label: 'الشذوذ',
    desc: 'مخالفة الثقة لمن هو أثبت منه',
    pattern: 'شاذ|شذوذ|غريب',
    color: 'amber',
  },
  {
    key: 'majhul',
    label: 'الجهالة',
    desc: 'راوٍ لم يُعرَّف حاله في الجرح والتعديل',
    pattern: 'مجهول|لا يُعرَف|جهالة',
    color: 'yellow',
  },
  {
    key: 'taliq',
    label: 'التعليق والإعضال',
    desc: 'سقوط أكثر من راوٍ من أول السند أو وسطه',
    pattern: 'معلَّق|مُعضَل|إعضال',
    color: 'teal',
  },
]

interface WeaknessStat { type_key: string; cnt: number }

interface HadithRow {
  hadith_id: number
  hadith_text: string
  book_name: string
  chapter_name: string | null
  judgment_text: string
  companion_name: string | null
  chain_count: number
  takhrij_id: number | null
}

export default async function WeaknessCatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedType = sp.type || ''
  const page = Math.max(1, parseInt(sp.page || '1'))
  const pageSize = 20
  const offset = (page - 1) * pageSize

  const typeDef = WEAKNESS_TYPES.find(t => t.key === selectedType)

  const [statsRes, haditshRes] = await Promise.all([
    // Count hadiths per weakness type
    Promise.all(WEAKNESS_TYPES.map(t =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT hadith_id)::int AS cnt
         FROM hadith_judgments
         WHERE say_text ~* $1`,
        [t.pattern]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
        .then(r => ({ type_key: t.key, cnt: r.rows[0]?.cnt || 0 }))
    )),

    // Hadiths for selected type
    selectedType && typeDef ? pool.query<HadithRow>(
      `SELECT DISTINCT ON (ht.main_id)
              ht.main_id AS hadith_id,
              LEFT(ht.tarf, 280) AS hadith_text,
              b.title AS book_name,
              ht.chapter_text AS chapter_name,
              hj.say_text AS judgment_text,
              NULL::int AS takhrij_id,
              (SELECT n.name FROM isnad_chains ic2
               JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id AND ih2.hadith_id = ht.main_id
               JOIN narrators n ON n.id = ic2.narrator_id_array[1]
               WHERE n.is_companion = true LIMIT 1) AS companion_name,
              (SELECT COUNT(DISTINCT ic2.id)::int FROM isnad_chains ic2
               JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id
               WHERE ih2.hadith_id = ht.main_id) AS chain_count
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE hj.say_text ~* $1
       ORDER BY ht.main_id
       LIMIT $2 OFFSET $3`,
      [typeDef.pattern, pageSize, offset]
    ).catch(() => ({ rows: [] as HadithRow[] })) : Promise.resolve({ rows: [] as HadithRow[] }),
  ])

  const stats: WeaknessStat[] = statsRes
  const hadiths = haditshRes.rows

  function colorScheme(color: string) {
    const map: Record<string, { bg: string; border: string; text: string; badge: string }> = {
      red:    { bg: 'bg-red-50',    border: 'border-red-100',    text: 'text-red-900',    badge: 'bg-red-100 text-red-800 border-red-200'    },
      orange: { bg: 'bg-orange-50', border: 'border-orange-100', text: 'text-orange-900', badge: 'bg-orange-100 text-orange-800 border-orange-200' },
      rose:   { bg: 'bg-rose-50',   border: 'border-rose-100',   text: 'text-rose-900',   badge: 'bg-rose-100 text-rose-800 border-rose-200'   },
      purple: { bg: 'bg-purple-50', border: 'border-purple-100', text: 'text-purple-900', badge: 'bg-purple-100 text-purple-800 border-purple-200' },
      indigo: { bg: 'bg-indigo-50', border: 'border-indigo-100', text: 'text-indigo-900', badge: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
      amber:  { bg: 'bg-amber-50',  border: 'border-amber-100',  text: 'text-amber-900',  badge: 'bg-amber-100 text-amber-800 border-amber-200'  },
      yellow: { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-yellow-900', badge: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
      teal:   { bg: 'bg-teal-50',   border: 'border-teal-100',   text: 'text-teal-900',   badge: 'bg-teal-100 text-teal-800 border-teal-200'   },
    }
    return map[color] || map.red
  }

  return (
    <div dir="rtl">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس أنواع الضعف</h1>
        <p className="text-sm text-gray-500">
          تصنيف الأحاديث بنوع علَّتها: انقطاع، إرسال، ضعف راوٍ، اضطراب، تدليس، شذوذ — أداة لدراسة منهجية أسباب الضعف
        </p>
      </div>

      {/* Type selector grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {WEAKNESS_TYPES.map(t => {
          const stat = stats.find(s => s.type_key === t.key)
          const c = colorScheme(t.color)
          const isActive = selectedType === t.key
          return (
            <a key={t.key}
              href={isActive ? '/hadiths/weakness-catalog' : `/hadiths/weakness-catalog?type=${t.key}`}
              className={`rounded-xl border p-3 transition-all hover:shadow-sm ${
                isActive ? `${c.bg} ${c.border} shadow-sm` : 'bg-white border-gray-100 hover:border-gray-200'
              }`}>
              <div className={`font-bold text-sm mb-0.5 ${isActive ? c.text : 'text-gray-800'}`}>
                {t.label}
              </div>
              <div className="text-xs text-gray-400 mb-2 leading-relaxed">{t.desc}</div>
              <div className={`text-xs font-medium ${isActive ? c.text : 'text-gray-500'}`}>
                {stat?.cnt.toLocaleString('ar-EG') || 0} حديث
              </div>
            </a>
          )
        })}
      </div>

      {/* Introduction when no type selected */}
      {!selectedType && (
        <div className="bg-amber-50 border border-amber-100 rounded-xl p-5 text-sm text-amber-800">
          <h2 className="font-bold mb-2">علوم الحديث: أسباب الضعف</h2>
          <ul className="space-y-1.5 text-xs leading-relaxed">
            <li><strong>الانقطاع:</strong> سقوط راوٍ من السند دون ذِكره — ينقلب الحديث من متصل إلى منقطع</li>
            <li><strong>الإرسال:</strong> رواية التابعي عن النبي مباشرةً — شكل خاص من الانقطاع في أول السند</li>
            <li><strong>ضعف الراوي:</strong> وجود راوٍ ضعيف الحفظ أو متَّهَم في السند يؤثر على صحة الحديث</li>
            <li><strong>الاضطراب:</strong> اختلاف بين الروايات لا يمكن ترجيح إحداها — دليل عدم الضبط</li>
            <li><strong>التدليس:</strong> إخفاء الراوي ضعف شيخه أو انقطاع السند بصيغة العنعنة</li>
            <li><strong>الشذوذ:</strong> مخالفة الثقة لروايات الثقات الأكثر — الراجح هو الأكثر والأضبط</li>
          </ul>
        </div>
      )}

      {/* Hadith list for selected type */}
      {selectedType && typeDef && (
        <>
          <div className={`rounded-xl border p-3 mb-4 text-sm ${colorScheme(typeDef.color).bg} ${colorScheme(typeDef.color).border}`}>
            <span className={`font-bold ${colorScheme(typeDef.color).text}`}>{typeDef.label}: </span>
            <span className="text-gray-600 text-xs">{typeDef.desc}</span>
          </div>

          <div className="space-y-3">
            {hadiths.map(h => (
              <div key={h.hadith_id}
                className="bg-white rounded-xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-xs text-gray-500">{h.book_name}</span>
                  {h.chapter_name && <span className="text-xs text-gray-400">— {h.chapter_name}</span>}
                  {h.companion_name && (
                    <span className="text-xs bg-amber-50 text-amber-800 border border-amber-100 px-2 py-0.5 rounded-full">
                      {h.companion_name}
                    </span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full border mr-auto ${colorScheme(typeDef.color).badge}`}>
                    {h.judgment_text.slice(0, 60)}
                  </span>
                </div>
                <p className="text-sm text-gray-900 leading-relaxed mb-2">
                  {h.hadith_text}{h.hadith_text?.length === 280 && '...'}
                </p>
                <div className="flex gap-3 text-xs">
                  <Link href={`/hadith/${h.hadith_id}`} className="text-green-700 hover:underline">تفاصيل ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/chain-weakness`} className="text-red-600 hover:underline">تحليل الضعف ←</Link>
                  <Link href={`/hadith/${h.hadith_id}/research-report`} className="text-blue-600 hover:underline">تقرير ←</Link>
                  <span className="text-gray-300">{h.chain_count} سند</span>
                </div>
              </div>
            ))}

            {hadiths.length === 0 && (
              <div className="bg-gray-50 rounded-xl p-8 text-center text-sm text-gray-400">
                لا توجد نتائج لهذا النوع من الضعف
              </div>
            )}
          </div>

          {/* Pagination */}
          {(hadiths.length === pageSize || page > 1) && (
            <div className="flex gap-2 mt-5 justify-center">
              {page > 1 && (
                <a href={`/hadiths/weakness-catalog?type=${selectedType}&page=${page - 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-gray-300">
                  ← السابق
                </a>
              )}
              <span className="text-sm text-gray-400 self-center">صفحة {page.toLocaleString('ar-EG')}</span>
              {hadiths.length === pageSize && (
                <a href={`/hadiths/weakness-catalog?type=${selectedType}&page=${page + 1}`}
                  className="text-sm bg-white border border-gray-200 px-4 py-2 rounded-lg hover:border-gray-300">
                  التالي →
                </a>
              )}
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/ilal" className="text-green-700 hover:underline">← علل الحديث</Link>
        <Link href="/hadiths/mawquf" className="text-green-700 hover:underline">← الموقوف والمرسل</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
      </div>
    </div>
  )
}
