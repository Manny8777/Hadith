import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'الرواة الشاملون — في كتب متعددة — جامع خادم الحرمين' }

interface NarratorRow {
  id: number
  name: string
  abb_name: string | null
  death_year: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  tabaqa: string | null
  is_companion: boolean
  hadiths_count: number
  book_count: number
  chain_count: number
  book_names: string
}

const BOOK_SETS = [
  {
    key: 'six',
    label: 'الكتب الستة',
    bookIds: [1, 2, 3, 4, 5, 6],
    color: 'bg-green-900 text-white',
    badgeColor: 'bg-green-100 text-green-800',
  },
  {
    key: 'sahihayn',
    label: 'الصحيحان',
    bookIds: [1, 2],
    color: 'bg-green-700 text-white',
    badgeColor: 'bg-green-50 text-green-700',
  },
  {
    key: 'three',
    label: 'ثلاثة كتب فأكثر',
    bookIds: null, // handled specially
    minBooks: 3,
    color: 'bg-teal-700 text-white',
    badgeColor: 'bg-teal-50 text-teal-700',
  },
  {
    key: 'four',
    label: 'أربعة كتب فأكثر',
    bookIds: null,
    minBooks: 4,
    color: 'bg-blue-700 text-white',
    badgeColor: 'bg-blue-50 text-blue-700',
  },
  {
    key: 'five',
    label: 'خمسة كتب فأكثر',
    bookIds: null,
    minBooks: 5,
    color: 'bg-indigo-700 text-white',
    badgeColor: 'bg-indigo-50 text-indigo-700',
  },
]

const SORT_OPTIONS = [
  { key: 'book_count', label: 'أكثر كتباً' },
  { key: 'hadiths', label: 'أكثر أحاديثاً' },
  { key: 'death', label: 'تاريخ الوفاة' },
]

export default async function UniversalNarratorsPage({
  searchParams,
}: {
  searchParams: Promise<{ set?: string; sort?: string; page?: string; companion?: string }>
}) {
  const sp = await searchParams
  const setKey = sp.set || 'six'
  const sort = sp.sort || 'book_count'
  const page = Math.max(1, parseInt(sp.page || '1'))
  const companionOnly = sp.companion === '1'
  const limit = 30
  const offset = (page - 1) * limit

  const activeSet = BOOK_SETS.find(s => s.key === setKey) || BOOK_SETS[0]
  const minBooks = activeSet.bookIds ? activeSet.bookIds.length : (activeSet.minBooks || 3)
  const bookIds = activeSet.bookIds || [1, 2, 3, 4, 5, 6]

  const companionClause = companionOnly ? 'AND n.is_companion = true' : ''

  const orderBy =
    sort === 'death' ? 'n.death_year_num ASC NULLS LAST, book_count DESC' :
    sort === 'hadiths' ? 'n.hadiths_count DESC, book_count DESC' :
    'book_count DESC, n.hadiths_count DESC'

  const [rowsRes, countRes] = await Promise.all([
    pool.query<NarratorRow>(
      `SELECT
         n.id, n.name, n.abb_name, n.death_year_num AS death_year, n.death_year_num,
         n.martaba_ibn_hajar, n.tabaqa, n.is_companion,
         COALESCE(n.hadiths_count, 0) AS hadiths_count,
         COUNT(DISTINCT ht.book_id)::int AS book_count,
         COUNT(DISTINCT ic.id)::int AS chain_count,
         STRING_AGG(DISTINCT b.title, '، ' ORDER BY b.title) AS book_names
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.id = ih.hadith_id
       JOIN books b ON b.id = ht.book_id
       WHERE ht.book_id = ANY($1::int[])
         ${companionClause}
       GROUP BY n.id, n.name, n.abb_name, n.death_year, n.death_year_num,
                n.martaba_ibn_hajar, n.tabaqa, n.is_companion, n.hadiths_count
       HAVING COUNT(DISTINCT ht.book_id) >= $2
       ORDER BY ${orderBy}
       LIMIT ${limit} OFFSET ${offset}`,
      [bookIds, minBooks]
    ).catch(() => ({ rows: [] as NarratorRow[] })),

    pool.query<{ total: number }>(
      `SELECT COUNT(DISTINCT n.id)::int AS total
       FROM narrators n
       JOIN isnad_chains ic ON n.id = ANY(ic.narrator_id_array)
       JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
       JOIN hadith_toc ht ON ht.id = ih.hadith_id
       WHERE ht.book_id = ANY($1::int[])
         ${companionClause}
       GROUP BY n.id
       HAVING COUNT(DISTINCT ht.book_id) >= $2`,
      [bookIds, minBooks]
    ).then(res => ({ rows: [{ total: res.rows.length }] }))
    .catch(() => ({ rows: [{ total: 0 }] })),
  ])

  const rows = rowsRes.rows
  const total = countRes.rows[0]?.total || 0
  const totalPages = Math.ceil(total / limit)

  function buildUrl(overrides: Record<string, string>) {
    const p = new URLSearchParams()
    p.set('set', setKey)
    p.set('sort', sort)
    p.set('page', String(page))
    if (companionOnly) p.set('companion', '1')
    Object.entries(overrides).forEach(([k, v]) => p.set(k, v))
    return `/narrators/universal?${p.toString()}`
  }

  function gradeColor(g: string | null, isComp: boolean): string {
    if (isComp) return 'bg-amber-100 text-amber-800'
    if (!g) return 'bg-gray-100 text-gray-500'
    if (/ثقة ثبت/.test(g)) return 'bg-green-200 text-green-900'
    if (/ثقة/.test(g)) return 'bg-green-100 text-green-700'
    if (/صدوق/.test(g)) return 'bg-blue-100 text-blue-700'
    if (/ضعيف|مجهول/.test(g)) return 'bg-red-100 text-red-700'
    return 'bg-gray-100 text-gray-600'
  }

  return (
    <div dir="rtl">
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-green-900 mb-1">الرواة الشاملون — في الكتب المتعددة</h1>
        <p className="text-sm text-gray-500 mb-3">
          الرواة الذين وردت أسانيدهم في أكثر من كتاب — يعكس مدى قبول الراوي عند المحدثين
          وانتشار روايته في المصادر الكبرى
        </p>

        <div className="bg-green-50 border border-green-100 rounded-xl p-3 mb-4 text-xs text-green-900">
          <span className="font-semibold">دلالة الشمول: </span>
          الراوي الذي روى عنه أصحاب الكتب الستة نال ثقة النقاد وقُبل حديثه في أوسع المدارس الحديثية.
          الراوي الموجود في صحيحَي البخاري ومسلم تحقق فيه أعلى معايير النقد.
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          {BOOK_SETS.map(s => (
            <Link key={s.key} href={buildUrl({ set: s.key, page: '1' })}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all font-medium ${
                setKey === s.key
                  ? `${s.color} border-transparent`
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-xs text-gray-500">ترتيب:</span>
          {SORT_OPTIONS.map(s => (
            <Link key={s.key} href={buildUrl({ sort: s.key, page: '1' })}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                sort === s.key
                  ? 'bg-green-800 text-white border-green-800'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-green-300'
              }`}>
              {s.label}
            </Link>
          ))}
          <Link href={buildUrl({ companion: companionOnly ? '0' : '1', page: '1' })}
            className={`text-xs px-3 py-1 rounded-full border transition-colors mr-2 ${
              companionOnly
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300'
            }`}>
            {companionOnly ? '✓ الصحابة فقط' : 'تصفية: الصحابة فقط'}
          </Link>
        </div>

        <div className="text-xs text-gray-400">
          {total.toLocaleString('ar-EG')} راوٍ — صفحة {page} من {totalPages}
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((r, idx) => (
          <div key={r.id}
            className="bg-white rounded-xl border border-gray-100 p-3 hover:shadow-sm hover:border-green-200 transition-all">
            <div className="flex items-start gap-3">
              <span className="text-xs text-gray-300 shrink-0 w-6">
                {(offset + idx + 1).toLocaleString('ar-EG')}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  {r.is_companion && (
                    <span className="text-xs bg-amber-500 text-white px-1.5 py-0.5 rounded-full">صحابي</span>
                  )}
                  <Link href={`/narrator/${r.id}`}
                    className="font-bold text-green-900 hover:underline text-sm">
                    {r.name}
                  </Link>
                  {r.abb_name && r.abb_name !== r.name && (
                    <span className="text-xs text-gray-400">({r.abb_name})</span>
                  )}
                  {r.tabaqa && (
                    <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      {r.tabaqa}
                    </span>
                  )}
                  {r.death_year && (
                    <span className="text-xs text-gray-400">ت {r.death_year}</span>
                  )}
                  {r.martaba_ibn_hajar && (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${gradeColor(r.martaba_ibn_hajar, r.is_companion)}`}>
                      {r.martaba_ibn_hajar}
                    </span>
                  )}
                </div>
                <div className="text-xs text-green-700 bg-green-50 rounded-lg px-2 py-1 mb-1.5 line-clamp-1">
                  <span className="font-semibold">{r.book_count} كتب: </span>
                  {r.book_names}
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400">
                  <span>{r.hadiths_count.toLocaleString('ar-EG')} حديث</span>
                  <span>{r.chain_count.toLocaleString('ar-EG')} سند</span>
                  <Link href={`/narrator/${r.id}/statistics`}
                    className="text-indigo-600 hover:underline">إحصاءات ←</Link>
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
        <Link href="/narrators/sahihayn" className="text-green-700 hover:underline">← رجال الصحيحين</Link>
        <Link href="/narrators/multi-book" className="text-green-700 hover:underline">← رواة الكتب المتعددة</Link>
        <Link href="/hadiths/in-all-six" className="text-green-700 hover:underline">← الأحاديث الجامعة للستة</Link>
      </div>
    </div>
  )
}
