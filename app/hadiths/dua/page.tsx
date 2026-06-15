import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'أحاديث الأدعية والأذكار — جامع خادم الحرمين' }

interface DuaRow {
  hadith_id: number
  book_name: string
  book_id: number
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  chain_count: number
  judgment_text: string | null
  scientist_name: string | null
  companion_name: string | null
}

const DUA_TYPES = [
  {
    key: 'allahumma',
    label: 'أدعية تبدأ بـ"اللهم"',
    pattern: 'اللهم',
    color: 'bg-green-700 text-white',
    cardColor: 'border-green-100 bg-green-50',
    badgeColor: 'bg-green-100 text-green-800',
  },
  {
    key: 'rabbi',
    label: 'أدعية: رَبِّ/ربنا',
    pattern: 'رب اغفر|ربنا آتنا|رب زدني|رب أعني|ربِّ إني|ربنا لك',
    color: 'bg-teal-700 text-white',
    cardColor: 'border-teal-100 bg-teal-50',
    badgeColor: 'bg-teal-100 text-teal-800',
  },
  {
    key: 'subhan',
    label: 'التسبيح والتحميد',
    pattern: 'سبحان الله|سبحانه وتعالى|الحمد لله رب|لا إله إلا الله وحده',
    color: 'bg-amber-700 text-white',
    cardColor: 'border-amber-100 bg-amber-50',
    badgeColor: 'bg-amber-100 text-amber-800',
  },
  {
    key: 'istighfar',
    label: 'الاستغفار',
    pattern: 'أستغفر الله|اللهم اغفر لي|استغفر الله العظيم',
    color: 'bg-blue-700 text-white',
    cardColor: 'border-blue-100 bg-blue-50',
    badgeColor: 'bg-blue-100 text-blue-800',
  },
  {
    key: 'salawat',
    label: 'الصلاة على النبي',
    pattern: 'اللهم صلِّ على|الصلاة على النبي|صلوا عليَّ',
    color: 'bg-purple-700 text-white',
    cardColor: 'border-purple-100 bg-purple-50',
    badgeColor: 'bg-purple-100 text-purple-800',
  },
  {
    key: 'morning_evening',
    label: 'أذكار الصباح والمساء',
    pattern: 'أصبح|أمسى|إذا أصبح|إذا أمسى|صباح|مساء',
    color: 'bg-orange-700 text-white',
    cardColor: 'border-orange-100 bg-orange-50',
    badgeColor: 'bg-orange-100 text-orange-800',
  },
  {
    key: 'sleep',
    label: 'أدعية النوم والاستيقاظ',
    pattern: 'إذا أراد أن ينام|إذا أوى إلى فراشه|إذا استيقظ|اللهم باسمك أموت',
    color: 'bg-indigo-700 text-white',
    cardColor: 'border-indigo-100 bg-indigo-50',
    badgeColor: 'bg-indigo-100 text-indigo-800',
  },
]

export default async function DuaPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; sort?: string; page?: string; q?: string }>
}) {
  const sp = await searchParams
  const type = sp.type || 'allahumma'
  const sort = sp.sort || 'chain_count'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const customQ = sp.q || ''
  const limit = 20
  const offset = (page - 1) * limit

  const activeDua = DUA_TYPES.find(d => d.key === type) || DUA_TYPES[0]
  const searchPattern = customQ || activeDua.pattern

  const typeCounts = await Promise.all(
    DUA_TYPES.map(d =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT main_id)::int AS cnt FROM hadith_toc WHERE is_leaf = true AND is_paragraph = true AND tarf ~* $1`,
        [d.pattern]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const [rowsRes, countRes] = await Promise.all([
    pool.query<DuaRow>(
      `SELECT DISTINCT ON (ht.main_id)
              ht.main_id AS hadith_id,
              ht.book_id,
              b.title AS book_name,
              b.takhrij_death AS book_death,
              ht.chapter_text AS chapter_name,
              LEFT(regexp_replace(coalesce(ht.tarf,''), '<[^>]+>', ' ', 'g'), 300) AS hadith_text,
              (SELECT COUNT(DISTINCT ic.id)::int
               FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
               WHERE ih.hadith_id = ht.main_id) AS chain_count,
              (SELECT hj.say_text FROM hadith_judgments hj WHERE hj.hadith_id = ht.main_id LIMIT 1) AS judgment_text,
              (SELECT n.name FROM hadith_judgments hj JOIN narrators n ON n.id = hj.scientist_id WHERE hj.hadith_id = ht.main_id LIMIT 1) AS scientist_name,
              (SELECT n.name FROM isnad_chains ic2
               JOIN isnad_hadiths ih2 ON ih2.isnad_id = ic2.id
               JOIN narrators n ON n.id = ic2.narrator_id_array[1] AND n.is_companion = true
               WHERE ih2.hadith_id = ht.main_id
               LIMIT 1) AS companion_name
       FROM hadith_toc ht
       JOIN books b ON b.id = ht.book_id
       WHERE ht.is_leaf = true AND ht.is_paragraph = true AND ht.tarf ~* $1
       ORDER BY ht.main_id, chain_count DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [searchPattern]
    ).then(res => {
      res.rows.sort((a, b) =>
        sort === 'chain_count' ? (b.chain_count - a.chain_count) :
        sort === 'death' ? ((a.book_death || 9999) - (b.book_death || 9999)) : 0
      )
      return res
    }).catch(() => ({ rows: [] as DuaRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT main_id)::int AS total FROM hadith_toc WHERE is_leaf = true AND is_paragraph = true AND tarf ~* $1`,
      [searchPattern]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('type', type)
    p.set('sort', sort)
    p.set('page', String(page))
    if (customQ) p.set('q', customQ)
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/dua?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">أحاديث الأدعية والأذكار</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث الدعاء والذكر مصنَّفةً بحسب نوع الصيغة — مستخرجة بالبحث في نصوص الأحاديث
          مع ربطها بأسانيدها وأحكام العلماء
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-900">
          <span className="font-semibold">منهجية الاستخراج: </span>
          يُبحث في نصوص الأحاديث بصيغ بعينها (اللهم، رب، سبحان...). هذا الاستخراج بالنص لا يضمن
          الشمول الكامل، إذ قد تكون أحاديث الدعاء بصيغ أخرى. لكنه يعطي مجموعة واسعة وممثِّلة.
        </div>

        {/* Custom search */}
        <form action="/hadiths/dua" method="get" className="mb-4">
          <div className="flex gap-2">
            <input name="q" defaultValue={customQ}
              placeholder="ابحث في نصوص الدعاء..."
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
              dir="rtl" />
            <input type="hidden" name="type" value={type} />
            <button type="submit"
              className="text-xs bg-green-800 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
              بحث
            </button>
          </div>
        </form>

        {/* Type tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {DUA_TYPES.map((d, i) => (
            <Link key={d.key} href={`/hadiths/dua?type=${d.key}`}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5 ${
                type === d.key && !customQ
                  ? `${d.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {d.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                type === d.key && !customQ ? 'bg-white/20 text-white' : d.badgeColor
              }`}>
                {typeCounts[i]?.rows[0]?.cnt?.toLocaleString('ar-EG') || '...'}
              </span>
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {[
            { key: 'chain_count', label: 'عدد الأسانيد' },
            { key: 'death', label: 'تاريخ الكتاب' },
          ].map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="text-xs text-gray-400">
          {customQ ? `بحث عن: "${customQ}" — ` : `${activeDua.label} — `}
          {total.toLocaleString('ar-EG')} حديث — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div key={r.hadith_id}
            className={`rounded-xl border p-4 hover:shadow-sm transition-all ${activeDua.cardColor}`}>
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${activeDua.badgeColor}`}>
                    {customQ ? 'بحث مخصص' : activeDua.label}
                  </span>
                  <span className="text-xs text-gray-500">{r.book_name}</span>
                  {r.book_death && (
                    <span className="text-xs text-gray-400">ت {r.book_death}هـ</span>
                  )}
                  {r.companion_name && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                      {r.companion_name}
                    </span>
                  )}
                  {r.chain_count > 0 && (
                    <span className="text-xs text-gray-400">{r.chain_count} سند</span>
                  )}
                </div>
                <div className="text-sm text-gray-800 leading-loose mb-2">
                  {r.hadith_text}{r.hadith_text?.length >= 300 ? '...' : ''}
                </div>
                {r.judgment_text && (
                  <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2.5 py-1.5 mb-2">
                    <span className="font-semibold">{r.scientist_name}: </span>
                    {r.judgment_text}
                  </div>
                )}
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-green-700 hover:underline font-medium">
                    الحديث الكامل ←
                  </Link>
                  {r.chapter_name && (
                    <span className="text-gray-400 truncate max-w-[200px]">{r.chapter_name}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="bg-gray-50 rounded-xl p-8 text-center text-gray-500">لا توجد نتائج</div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-5 flex-wrap">
          {page > 1 && (
            <Link href={buildUrl({ page: String(page - 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">← السابق</Link>
          )}
          <span className="text-xs text-gray-500">{page} / {totalPages}</span>
          {page < totalPages && (
            <Link href={buildUrl({ page: String(page + 1) })}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:border-green-400">التالي ←</Link>
          )}
        </div>
      )}

      <div className="mt-6 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/hadiths/qudsi" className="text-green-700 hover:underline">← الأحاديث القدسية</Link>
        <Link href="/search" className="text-green-700 hover:underline">← البحث المتقدم</Link>
        <Link href="/topics" className="text-green-700 hover:underline">← الفهارس الموضوعية</Link>
      </div>
    </div>
  )
}
