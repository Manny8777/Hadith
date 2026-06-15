import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الأعلام — جامع خادم الحرمين' }

interface NameRow {
  title: string
  category: string
  index_id: number
}

const ARABIC_ALPHABET = 'أابتثجحخدذرزسشصضطظعغفقكلمنهوي'

/** Normalise alef variants to أ for grouping */
function firstLetter(s: string): string {
  const ch = s.trimStart().charAt(0)
  if ('اإأآ'.includes(ch)) return 'أ'
  return ch || '؟'
}

/** Visual config per category id */
const CATEGORY_META: Record<number, { label: string; badge: string; order: number }> = {
  4:  { label: 'رجال',   badge: 'bg-blue-100 text-blue-800 border-blue-200',   order: 1 },
  5:  { label: 'نساء',   badge: 'bg-rose-100 text-rose-800 border-rose-200',   order: 2 },
  8:  { label: 'أنبياء', badge: 'bg-amber-100 text-amber-800 border-amber-200', order: 3 },
  9:  { label: 'شعراء',  badge: 'bg-purple-100 text-purple-800 border-purple-200', order: 4 },
  13: { label: 'الأوائل',badge: 'bg-teal-100 text-teal-800 border-teal-200',   order: 5 },
}

const CATEGORY_IDS = [4, 5, 8, 9, 13]

export default async function NamesIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string; cat?: string }>
}) {
  const sp = await searchParams
  const rawLetter = sp.letter || 'أ'
  const activeLetter = 'اإأآ'.includes(rawLetter) ? 'أ' : rawLetter
  const activeCat = sp.cat ? parseInt(sp.cat) : 0   // 0 = all

  const { rows: all } = await pool
    .query<NameRow>(
      `SELECT i.title, c.title AS category, i.index_id
       FROM hadith_index_items i
       JOIN hadith_index_categories c ON c.id = i.index_id
       WHERE i.index_id = ANY($1::int[])
       ORDER BY i.title`,
      [CATEGORY_IDS]
    )
    .catch(() => ({ rows: [] as NameRow[] }))

  // Group by first letter
  const grouped = new Map<string, NameRow[]>()
  for (const row of all) {
    const letter = firstLetter(row.title)
    if (!grouped.has(letter)) grouped.set(letter, [])
    grouped.get(letter)!.push(row)
  }

  const letterCounts = new Map<string, number>()
  for (const [l, items] of grouped) letterCounts.set(l, items.length)

  // Items for active letter, optionally filtered by category
  let activeItems = grouped.get(activeLetter) ?? []
  if (activeCat && CATEGORY_IDS.includes(activeCat)) {
    activeItems = activeItems.filter(r => r.index_id === activeCat)
  }

  // Category totals for current letter
  const catCounts = new Map<number, number>()
  for (const row of grouped.get(activeLetter) ?? []) {
    catCounts.set(row.index_id, (catCounts.get(row.index_id) ?? 0) + 1)
  }

  function buildUrl(l: string, cat = activeCat) {
    const params = new URLSearchParams({ letter: l })
    if (cat) params.set('cat', String(cat))
    return `/indexes/names?${params.toString()}`
  }

  function buildCatUrl(cat: number) {
    const params = new URLSearchParams({ letter: activeLetter })
    if (cat) params.set('cat', String(cat))
    return `/indexes/names?${params.toString()}`
  }

  const totalForLetter = (grouped.get(activeLetter) ?? []).length

  return (
    <div dir="rtl">
      {/* Breadcrumb + header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/indexes" className="hover:text-green-700">الفهارس</Link>
          <span>/</span>
          <span className="text-green-800">فهرس الأعلام</span>
        </div>
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الأعلام</h1>
        <p className="text-sm text-gray-500">
          أسماء الأعلام الواردة في الأحاديث — {all.length.toLocaleString('ar-EG')} اسم
        </p>
      </div>

      {/* Category filter bar */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Link href={buildCatUrl(0)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
            activeCat === 0
              ? 'bg-green-800 text-white border-green-800'
              : 'bg-white text-green-800 border-green-200 hover:bg-green-50'
          }`}>
          الكل ({totalForLetter.toLocaleString('ar-EG')})
        </Link>
        {CATEGORY_IDS.map(cid => {
          const meta = CATEGORY_META[cid]
          const cnt = catCounts.get(cid) ?? 0
          if (cnt === 0) return null
          return (
            <Link key={cid} href={buildCatUrl(cid)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                activeCat === cid
                  ? 'bg-green-800 text-white border-green-800'
                  : `bg-white hover:bg-green-50 border-gray-200 text-gray-700`
              }`}>
              {meta.label} ({cnt.toLocaleString('ar-EG')})
            </Link>
          )
        })}
      </div>

      {/* Alphabet nav */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {ARABIC_ALPHABET.split('').map(l => {
            const cnt = letterCounts.get(l) ?? 0
            const isActive = l === activeLetter
            if (cnt === 0) return (
              <span key={l}
                className="px-2.5 py-2 rounded-lg text-sm font-bold min-w-[36px] text-center bg-gray-50 text-gray-300 cursor-not-allowed select-none">
                {l}
              </span>
            )
            return (
              <Link key={l} href={buildUrl(l, 0)}
                className={`relative px-2.5 py-2 rounded-lg text-sm font-bold min-w-[36px] text-center transition-colors ${
                  isActive
                    ? 'bg-green-800 text-white shadow-sm'
                    : 'bg-green-50 text-green-800 hover:bg-green-100 border border-green-100'
                }`}>
                {l}
                <span
                  className={`absolute -top-1 -left-1 text-center leading-none rounded-full min-w-[14px] px-0.5 py-0.5 ${
                    isActive ? 'bg-amber-300 text-green-900' : 'bg-green-200 text-green-700'
                  }`}
                  style={{ fontSize: '9px' }}>
                  {cnt > 999 ? '٩٩٩+' : cnt}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-400 px-1">
          الحرف: <strong className="text-green-800">{activeLetter}</strong> — {activeItems.length.toLocaleString('ar-EG')} اسم
          {activeCat > 0 && <span className="mr-2">(مصفّى: {CATEGORY_META[activeCat]?.label})</span>}
        </div>
      </div>

      {/* Name list */}
      {activeItems.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-10 text-center text-gray-400">
          لا توجد أعلام لهذا الحرف
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {activeItems.map((item, idx) => {
            const meta = CATEGORY_META[item.index_id]
            return (
              <div key={idx}
                className="px-5 py-3 flex items-center gap-3 hover:bg-green-50 transition-colors group">
                <span className="shrink-0 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">
                  {(idx + 1).toLocaleString('ar-EG')}
                </span>
                <span className="flex-1 text-sm text-gray-800 font-semibold">{item.title}</span>
                {meta && (
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium ${meta.badge}`}>
                    {meta.label}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-8 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/indexes" className="text-green-700 hover:underline">← الفهارس</Link>
        <Link href="/indexes/quran" className="text-green-700 hover:underline">← فهرس الآيات</Link>
        <Link href="/indexes/poetry" className="text-green-700 hover:underline">← فهرس الشعر</Link>
      </div>
    </div>
  )
}
