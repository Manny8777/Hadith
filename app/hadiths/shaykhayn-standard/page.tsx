import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'على شرط الشيخين — جامع خادم الحرمين' }

interface JudgmentRow {
  hadith_id: number
  book_id: number
  book_name: string
  book_death: number | null
  chapter_name: string | null
  hadith_text: string
  judgment_text: string
  scientist_name: string
  chain_count: number
}

const STANDARDS = [
  {
    key: 'both',
    label: 'على شرط الشيخين',
    description: 'مروي برجال البخاري ومسلم معاً',
    pattern: 'على شرط(هما|الشيخين|البخاري ومسلم|مسلم والبخاري)',
    color: 'bg-green-900 text-white',
    badgeColor: 'bg-green-100 text-green-800',
    cardColor: 'border-green-200 bg-green-50',
    labelColor: 'bg-green-200 text-green-900',
  },
  {
    key: 'bukhari',
    label: 'على شرط البخاري',
    description: 'رجاله من رجال صحيح البخاري',
    pattern: 'على شرط البخاري(?! ومسلم)(?!ومسلم)',
    color: 'bg-amber-700 text-white',
    badgeColor: 'bg-amber-100 text-amber-800',
    cardColor: 'border-amber-200 bg-amber-50',
    labelColor: 'bg-amber-200 text-amber-900',
  },
  {
    key: 'muslim',
    label: 'على شرط مسلم',
    description: 'رجاله من رجال صحيح مسلم',
    pattern: 'على شرط مسلم(?! والبخاري)(?!والبخاري)',
    color: 'bg-blue-700 text-white',
    badgeColor: 'bg-blue-100 text-blue-700',
    cardColor: 'border-blue-200 bg-blue-50',
    labelColor: 'bg-blue-200 text-blue-900',
  },
  {
    key: 'lam_yukhrij',
    label: 'لم يخرجاه',
    description: 'على شرطهما لكنهما لم يخرجاه',
    pattern: 'على شرط.{0,30}لم يخرج',
    color: 'bg-purple-700 text-white',
    badgeColor: 'bg-purple-100 text-purple-700',
    cardColor: 'border-purple-200 bg-purple-50',
    labelColor: 'bg-purple-200 text-purple-900',
  },
]

export default async function ShaykhaynStandardPage({
  searchParams,
}: {
  searchParams: Promise<{ standard?: string; page?: string; sort?: string }>
}) {
  const sp = await searchParams
  const standard = sp.standard || 'both'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const sort = sp.sort || 'chain_count'
  const limit = 25
  const offset = (page - 1) * limit

  const activeStd = STANDARDS.find(s => s.key === standard) || STANDARDS[0]

  const stdCountsRes = await Promise.all(
    STANDARDS.map(s =>
      pool.query<{ cnt: number }>(
        `SELECT COUNT(DISTINCT hadith_id)::int AS cnt FROM hadith_judgments WHERE say_text ~* $1`,
        [s.pattern]
      ).catch(() => ({ rows: [{ cnt: 0 }] }))
    )
  )

  const orderBy =
    sort === 'death' ? 'ht.takhrij_death ASC NULLS LAST' :
    'chain_count DESC, ht.takhrij_death ASC'

  const [rowsRes, countRes] = await Promise.all([
    pool.query<JudgmentRow>(
      `SELECT DISTINCT ON (hj.hadith_id)
              hj.hadith_id, ht.book_id, b.title AS book_name, b.takhrij_death AS book_death,
              ht.chapter_text AS chapter_name,
              LEFT(ht.tarf, 200) AS hadith_text,
              hj.say_text AS judgment_text,
              hj.scientist_id AS scientist_name,
              (SELECT COUNT(DISTINCT ic.id)::int
               FROM isnad_chains ic
               JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
               WHERE ih.hadith_id = hj.hadith_id) AS chain_count
       FROM hadith_judgments hj
       JOIN hadith_toc ht ON ht.main_id = hj.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE hj.say_text ~* $1
       ORDER BY hj.hadith_id, chain_count DESC
       LIMIT ${limit} OFFSET ${offset}`,
      [activeStd.pattern]
    ).then(res => {
      if (sort === 'death') {
        res.rows.sort((a, b) => (a.book_death || 9999) - (b.book_death || 9999))
      } else {
        res.rows.sort((a, b) => (b.chain_count - a.chain_count))
      }
      return res
    }).catch(() => ({ rows: [] as JudgmentRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT hadith_id)::int AS total FROM hadith_judgments WHERE say_text ~* $1`,
      [activeStd.pattern]
    ).catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('standard', standard)
    p.set('sort', sort)
    p.set('page', String(page))
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/hadiths/shaykhayn-standard?${p.toString()}`
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">على شرط الشيخين</h1>
        <p className="text-sm text-gray-500 mb-3">
          أحاديث حكم عليها العلماء بأن رجالها يستوفون شرط البخاري أو مسلم أو كليهما —
          مصطلح دقيق يعني أن الرجال رووا في صحيح كلٍّ منهما لا أن الحديث فيه بعينه
        </p>

        <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 mb-4 text-xs text-amber-900">
          <span className="font-semibold">تنبيه منهجي: </span>
          "على شرط البخاري" لا تعني أن الحديث في صحيح البخاري، بل أن رواته من الرجال
          الذين روى لهم البخاري في صحيحه. وكثيراً ما يُقال "لم يخرجاه" مع هذا الحكم.
          النتائج مأخوذة من نصوص أحكام العلماء في قاعدة البيانات.
        </div>

        {/* Standard tabs */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {STANDARDS.map((s, i) => (
            <Link key={s.key} href={buildUrl({ standard: s.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium flex items-center gap-1.5 ${
                standard === s.key
                  ? `${s.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                standard === s.key ? 'bg-white/20 text-white' : s.badgeColor
              }`}>
                {stdCountsRes[i]?.rows[0]?.cnt?.toLocaleString('ar-EG') || '—'}
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
          {activeStd.label}: {total.toLocaleString('ar-EG')} حديث — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-3">
        {rows.map((r, idx) => (
          <div key={r.hadith_id}
            className={`rounded-xl border p-4 hover:shadow-sm transition-all ${activeStd.cardColor}`}>
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-400 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${activeStd.labelColor}`}>
                    {activeStd.label}
                  </span>
                  <span className="text-xs text-gray-500">{r.book_name}</span>
                  {r.book_death && (
                    <span className="text-xs text-gray-400">ت {r.book_death}هـ</span>
                  )}
                  {r.chain_count > 0 && (
                    <span className="text-xs bg-white/60 text-gray-600 px-1.5 py-0.5 rounded-full">
                      {r.chain_count} سند
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-800 leading-relaxed mb-2 line-clamp-2">
                  {r.hadith_text}{r.hadith_text?.length >= 200 ? '...' : ''}
                </div>
                <div className="text-xs text-gray-500 bg-white/70 rounded-lg px-2.5 py-1.5 mb-2 border border-white/80">
                  <span className="font-semibold text-green-800">{r.scientist_name}: </span>
                  {r.judgment_text}
                </div>
                <div className="flex items-center gap-3 text-xs flex-wrap">
                  <Link href={`/hadith/${r.hadith_id}`}
                    className="text-green-700 hover:underline font-medium">
                    الحديث الكامل ←
                  </Link>
                  <Link href={`/hadith/${r.hadith_id}/isnad-ranking`}
                    className="text-gray-400 hover:text-green-700">
                    ترتيب الأسانيد ←
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
        <Link href="/scholars/judgment-search" className="text-green-700 hover:underline">← بحث الأحكام</Link>
        <Link href="/hadiths/grade-dispute" className="text-green-700 hover:underline">← الخلاف في الدرجة</Link>
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/hadiths/weak-supported" className="text-green-700 hover:underline">← الضعيف المعتضد</Link>
      </div>
    </div>
  )
}
