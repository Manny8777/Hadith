import pool from '@/lib/db'
import Link from 'next/link'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'معجم الأماكن والبلدان — جامع خادم الحرمين' }

interface LetterNode {
  id: number
  text: string
  place_count: number
}

interface PlaceNode {
  id: number
  text: string
  parent_id: number
}

export default async function PlacesLexiconPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string }>
}) {
  const sp = await searchParams
  const LEXICON_ID = 3

  const [lettersRes, placesRes] = await Promise.all([
    pool.query<LetterNode>(
      `SELECT li.id, li.text, COUNT(children.id)::int AS place_count
       FROM lexicon_items li
       LEFT JOIN lexicon_items children ON children.parent_id = li.id AND children.lexicon_id = $1
       WHERE li.lexicon_id = $1 AND li.is_leaf = false
       GROUP BY li.id, li.text
       ORDER BY li.left_value`,
      [LEXICON_ID]
    ),
    pool.query<PlaceNode>(
      `SELECT li.id, li.text, li.parent_id
       FROM lexicon_items li
       WHERE li.lexicon_id = $1 AND li.is_leaf = true
       ORDER BY li.left_value`,
      [LEXICON_ID]
    ),
  ])

  const letters = lettersRes.rows
  const allPlaces = placesRes.rows
  const selectedLetterId = sp.letter ? parseInt(sp.letter) : letters[0]?.id

  const filteredPlaces = selectedLetterId
    ? allPlaces.filter(p => p.parent_id === selectedLetterId)
    : allPlaces

  const selectedLetter = letters.find(l => l.id === selectedLetterId)

  return (
    <div dir="rtl" className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-green-900 mb-1">معجم الأماكن والبلدان</h1>
        <p className="text-sm text-gray-500">
          {allPlaces.length} مكان وبلد مذكور في أحاديث الموسوعة · اختر حرفاً للتصفية
        </p>
      </div>

      <div className="flex gap-6">
        {/* Letter sidebar */}
        <aside className="w-20 shrink-0">
          <div className="sticky top-16 space-y-1">
            {letters.map(l => (
              <Link
                key={l.id}
                href={`/lexicon/places?letter=${l.id}`}
                className={`block text-center py-1.5 px-2 rounded-lg text-sm font-medium transition-colors ${
                  l.id === selectedLetterId
                    ? 'bg-green-700 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
                title={`${l.place_count} مكان`}
              >
                {l.text}
                {l.place_count > 0 && (
                  <span className={`block text-xs ${l.id === selectedLetterId ? 'text-green-200' : 'text-gray-400'}`}>
                    {l.place_count}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </aside>

        {/* Places list */}
        <div className="flex-1 min-w-0">
          {selectedLetter && (
            <h2 className="text-base font-bold text-green-800 mb-3 pb-2 border-b border-gray-100">
              الأماكن على حرف «{selectedLetter.text}»
              <span className="text-sm font-normal text-gray-400 mr-2">({filteredPlaces.length})</span>
            </h2>
          )}

          {filteredPlaces.length === 0 ? (
            <p className="text-sm text-gray-400">لا توجد أماكن لهذا الحرف</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {filteredPlaces.map(place => (
                <Link
                  key={place.id}
                  href={`/lexicon/${place.id}`}
                  className="px-3 py-2 rounded-lg bg-white border border-gray-100 text-sm text-gray-700 hover:border-green-200 hover:text-green-800 hover:shadow-sm transition-all"
                >
                  {place.text}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-gray-100">
        <Link href="/lexicon" className="text-sm text-green-700 hover:underline">
          ← معجم غريب الحديث
        </Link>
      </div>
    </div>
  )
}
