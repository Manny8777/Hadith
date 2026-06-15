import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'فهرس الشعر — جامع خادم الحرمين' }

interface VerseRow {
  main_id: number
  verse_text: string
}

const ARABIC_ALPHABET = 'أابتثجحخدذرزسشصضطظعغفقكلمنهوي'

function firstLetter(s: string): string {
  const ch = s.trimStart().replace(/^[ً-ٟ]/, '').charAt(0)
  if ('اإأآ'.includes(ch)) return 'أ'
  return ch || '؟'
}

function cleanVerse(raw: string): string {
  return raw
    .replace(/\[[^\]]*\]/g, '')     // remove variant readings [...]
    .replace(/\s+/g, ' ')
    .trim()
}

export default async function PoetryIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>
}) {
  const sp = await searchParams
  const rawLetter = sp.letter || ''

  const { rows: all } = await pool
    .query<VerseRow>(
      `SELECT
         ht.main_id,
         trim(regexp_replace(
           regexp_replace(m[1], '<[^>]+>', ' ', 'g'),
           '\\s+', ' ', 'g'
         )) AS verse_text
       FROM hadith_toc ht,
            regexp_matches(ht.content, '<شعر[^>]*>([\\s\\S]*?)</شعر>', 'g') AS m
       WHERE ht.content LIKE '%<شعر%'
         AND m[1] IS NOT NULL
         AND length(trim(m[1])) > 5
       ORDER BY verse_text
       LIMIT 2000`
    )
    .catch(() => ({ rows: [] as VerseRow[] }))

  // Clean and group by first letter
  const grouped = new Map<string, VerseRow[]>()
  for (const row of all) {
    const clean = cleanVerse(row.verse_text)
    if (!clean) continue
    const letter = firstLetter(clean)
    if (!grouped.has(letter)) grouped.set(letter, [])
    grouped.get(letter)!.push({ main_id: row.main_id, verse_text: clean })
  }

  const letterCounts = new Map<string, number>()
  for (const [l, items] of grouped) letterCounts.set(l, items.length)

  const activeLetter = rawLetter
    ? ('اإأآ'.includes(rawLetter) ? 'أ' : rawLetter)
    : (ARABIC_ALPHABET.split('').find(l => letterCounts.has(l)) ?? 'أ')

  const activeItems = grouped.get(activeLetter) ?? []
  const totalVerses = all.length

  function buildUrl(l: string) {
    return `/indexes/poetry?letter=${encodeURIComponent(l)}`
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-400 mb-3">
          <Link href="/indexes" className="hover:text-green-700">الفهارس</Link>
          <span>/</span>
          <span className="text-green-800">فهرس الشعر</span>
        </div>
        <h1 className="text-2xl font-bold text-green-900 mb-1">فهرس الشعر</h1>
        <p className="text-sm text-gray-500">
          الأبيات الشعرية الواردة في متون الأحاديث — {totalVerses.toLocaleString('ar-EG')} بيت مرتّب أبجدياً
        </p>
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
              <Link key={l} href={buildUrl(l)}
                className={`relative px-2.5 py-2 rounded-lg text-sm font-bold min-w-[36px] text-center transition-colors ${
                  isActive
                    ? 'bg-purple-800 text-white shadow-sm'
                    : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-100'
                }`}>
                {l}
                <span
                  className={`absolute -top-1 -left-1 text-center leading-none rounded-full min-w-[14px] px-0.5 py-0.5 ${
                    isActive ? 'bg-amber-300 text-purple-900' : 'bg-purple-200 text-purple-700'
                  }`}
                  style={{ fontSize: '9px' }}>
                  {cnt}
                </span>
              </Link>
            )
          })}
        </div>
        <div className="mt-3 text-xs text-gray-400 px-1">
          الحرف: <strong className="text-purple-800">{activeLetter}</strong> — {activeItems.length.toLocaleString('ar-EG')} بيت
        </div>
      </div>

      {/* Verse list */}
      {all.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-10 text-center text-gray-400">
          لا توجد أبيات شعرية في قاعدة البيانات
        </div>
      ) : activeItems.length === 0 ? (
        <div className="bg-gray-50 border border-gray-100 rounded-xl p-10 text-center text-gray-400">
          لا توجد أبيات تبدأ بهذا الحرف
        </div>
      ) : (
        <div className="space-y-2.5">
          {activeItems.map((item, idx) => (
            <div key={`${item.main_id}-${idx}`}
              className="bg-white rounded-xl border border-gray-100 px-5 py-4 hover:border-purple-200 hover:shadow-sm transition-all">
              <div className="flex items-start gap-4">
                <span className="shrink-0 mt-1 w-8 h-8 rounded-full bg-purple-100 text-purple-700 text-xs flex items-center justify-center font-bold">
                  {(idx + 1).toLocaleString('ar-EG')}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base text-gray-800 leading-loose mb-2"
                    style={{ fontFamily: '"Scheherazade New", "Traditional Arabic", serif' }}>
                    {item.verse_text}
                  </p>
                  <Link href={`/hadith/${item.main_id}`}
                    className="text-xs text-green-700 hover:underline">
                    الحديث رقم {item.main_id.toLocaleString('ar-EG')} ←
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer nav */}
      <div className="mt-8 flex items-center gap-4 text-sm flex-wrap">
        <Link href="/indexes" className="text-green-700 hover:underline">← الفهارس</Link>
        <Link href="/indexes/quran" className="text-green-700 hover:underline">← فهرس الآيات</Link>
        <Link href="/indexes/names" className="text-green-700 hover:underline">← فهرس الأعلام</Link>
      </div>
    </div>
  )
}
