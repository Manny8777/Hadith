import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الآيات — جامع خادم الحرمين' }

interface ItemRow {
  title: string
}

const ARABIC_ALPHABET = 'أابتثجحخدذرزسشصضطظعغفقكلمنهوي'

/** Return first Arabic letter of a string, normalising hamza variants */
function firstLetter(s: string): string {
  const ch = s.trimStart().charAt(0)
  // normalise alef variants → أ
  if ('اإأآ'.includes(ch)) return 'أ'
  return ch || '؟'
}

export default async function QuranIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>
}) {
  const sp = await searchParams
  const activeLetter = sp.letter || 'أ'

  const { rows: all } = await pool
    .query<ItemRow>(
      `SELECT title
       FROM hadith_index_items
       WHERE index_id = 2
       ORDER BY title
       LIMIT 2000`
    )
    .catch(() => ({ rows: [] as ItemRow[] }))

  // Group by first letter (normalised)
  const grouped = new Map<string, string[]>()
  for (const row of all) {
    const letter = firstLetter(row.title)
    if (!grouped.has(letter)) grouped.set(letter, [])
    grouped.get(letter)!.push(row.title)
  }

  // Letter counts for nav badges
  const letterCounts = new Map<string, number>()
  for (const [l, items] of grouped) letterCounts.set(l, items.length)

  // Normalise activeLetter for display
  const displayLetter = 'اإأآ'.includes(activeLetter) ? 'أ' : activeLetter
  const activeItems = grouped.get(displayLetter) ?? []

  function buildUrl(l: string) {
    return `/indexes/quran?letter=${encodeURIComponent(l)}`
  }

  // Unique letters that actually have data, in alphabet order
  const availableLetters = ARABIC_ALPHABET.split('').filter(l => letterCounts.has(l))

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/indexes" className="hover:text-green-700">الفهارس</Link>
          <span>/</span>
          <span className="text-green-800">فهرس الآيات</span>
        </div>
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الآيات</h1>
        <p className="text-sm text-gray-500">
          الآيات القرآنية الواردة في متون الأحاديث — {all.length.toLocaleString('ar-EG')} آية مرتّبة أبجدياً
        </p>
      </div>

      {/* Alphabet nav */}
      <div className="bg-white rounded-xl border border-gray-100 p-4 mb-5">
        <div className="flex flex-wrap gap-1.5">
          {ARABIC_ALPHABET.split('').map(l => {
            const cnt = letterCounts.get(l) ?? 0
            const isActive = l === displayLetter
            if (cnt === 0) return (
              <span key={l}
                className="px-2.5 py-2 rounded-lg text-sm font-bold min-w-[36px] text-center bg-gray-50 text-gray-300 cursor-not-allowed select-none">
                {l}
              </span>
            )
            return (
              <Link key={l} href={buildUrl(l)}
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
                  {cnt > 99 ? '٩٩+' : cnt}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-400 px-1">
          الحرف: <strong className="text-green-800">{displayLetter}</strong> — {activeItems.length.toLocaleString('ar-EG')} آية
        </div>
      </div>

      {/* Verse list */}
      {activeItems.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-10 text-center text-gray-400">
          لا توجد آيات تبدأ بهذا الحرف
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 divide-y divide-gray-50">
          {activeItems.map((verse, idx) => (
            <div
              key={idx}
              className="px-5 py-3 flex items-start gap-3 hover:bg-green-50 transition-colors group"
            >
              <span className="shrink-0 mt-0.5 w-6 h-6 rounded-full bg-green-100 text-green-700 text-xs flex items-center justify-center font-bold">
                {(idx + 1).toLocaleString('ar-EG')}
              </span>
              <p className="text-sm text-gray-800 leading-relaxed font-arabic flex-1"
                style={{ fontFamily: 'var(--font-arabic, "Scheherazade New", serif)' }}>
                {verse}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-8 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/indexes" className="text-green-700 hover:underline">← الفهارس</Link>
        <Link href="/indexes/names" className="text-green-700 hover:underline">← فهرس الأعلام</Link>
        <Link href="/indexes/poetry" className="text-green-700 hover:underline">← فهرس الشعر</Link>
      </div>
    </div>
  )
}
