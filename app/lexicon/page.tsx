export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import LexiconSearch from './LexiconSearch'

interface LetterNode {
  id: number
  text: string
  word_count: number
}

interface WordItem {
  id: number
  text: string
  children_count: number
  has_citations: boolean
}

async function getLetterNodes(): Promise<LetterNode[]> {
  const { rows } = await pool.query<LetterNode>(
    `SELECT id, text, (right_value - left_value - 1)/2 AS word_count
     FROM lexicon_items
     WHERE parent_id = 1 AND lexicon_id = 1 AND is_leaf = false
     ORDER BY text`
  )
  return rows
}

async function getWordsUnderLetter(
  letterId: number,
  page: number,
  limit: number
): Promise<{ words: WordItem[]; total: number }> {
  const offset = (page - 1) * limit
  const [wordsRes, countRes] = await Promise.all([
    pool.query<WordItem>(
      `SELECT li.id, li.text,
              (li.right_value - li.left_value - 1)/2 AS children_count,
              EXISTS (
                SELECT 1 FROM lexicon_hadith lh
                WHERE lh.lexicon_item_id = li.id
              ) AS has_citations
       FROM lexicon_items li
       WHERE li.parent_id = $1 AND li.is_leaf = false
       ORDER BY li.left_value
       LIMIT $2 OFFSET $3`,
      [letterId, limit, offset]
    ),
    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM lexicon_items
       WHERE parent_id = $1 AND is_leaf = false`,
      [letterId]
    ),
  ])
  return { words: wordsRes.rows, total: countRes.rows[0]?.cnt || 0 }
}

export default async function LexiconPage({
  searchParams,
}: {
  searchParams: Promise<{ letter?: string; page?: string }>
}) {
  const sp = await searchParams
  const selectedLetterId = sp.letter ? parseInt(sp.letter) : null
  const page = Math.max(1, parseInt(sp.page || '1'))
  const limit = 80

  const letterNodes = await getLetterNodes()

  let words: WordItem[] = []
  let total = 0
  let selectedLetter: LetterNode | null = null

  if (selectedLetterId && !isNaN(selectedLetterId)) {
    selectedLetter = letterNodes.find(l => l.id === selectedLetterId) || null
    if (selectedLetter) {
      const result = await getWordsUnderLetter(selectedLetterId, page, limit)
      words = result.words
      total = result.total
    }
  }

  const totalPages = Math.ceil(total / limit)
  const totalWords = letterNodes.reduce((s, l) => s + Number(l.word_count), 0)

  return (
    <div dir="rtl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-green-900 mb-2">غريب الحديث</h1>
        <p className="text-gray-600 text-sm">
          معجم ألفاظ الحديث النبوي الشريف — شرح الكلمات الغريبة والنادرة الواردة في السنة
        </p>
      </div>

      <LexiconSearch />

      {/* Letter navigation */}
      <div className="mt-8">
        <h2 className="text-sm font-semibold text-gray-500 mb-3">تصفح بحسب الحرف</h2>
        <div className="grid grid-cols-7 sm:grid-cols-14 gap-1.5 mb-6">
          {letterNodes.map(letter => {
            const isSelected = selectedLetterId === letter.id
            return (
              <Link
                key={letter.id}
                href={`/lexicon?letter=${letter.id}`}
                title={`${letter.text} — ${Number(letter.word_count).toLocaleString('ar-EG')} مدخل`}
                className={`text-center py-2 rounded-xl text-base font-bold transition-all border ${
                  isSelected
                    ? 'bg-green-800 text-white border-green-800 shadow-md'
                    : 'bg-white text-green-900 border-gray-200 hover:bg-green-50 hover:border-green-300'
                }`}
              >
                <span className="block">{letter.text}</span>
                <span
                  className={`block text-[9px] font-normal leading-tight ${
                    isSelected ? 'text-green-200' : 'text-gray-400'
                  }`}
                >
                  {Number(letter.word_count).toLocaleString('ar-EG')}
                </span>
              </Link>
            )
          })}
        </div>

        {/* Words list or welcome */}
        {selectedLetter ? (
          <div>
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="text-xl font-bold text-green-900">
                مداخل حرف {selectedLetter.text}
                <span className="text-sm font-normal text-gray-500 mr-2">
                  ({total.toLocaleString('ar-EG')} مدخل)
                </span>
              </h2>
              {totalPages > 1 && (
                <span className="text-xs text-gray-400">
                  صفحة {page.toLocaleString('ar-EG')} من {totalPages.toLocaleString('ar-EG')}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {words.map(word => (
                <Link
                  key={word.id}
                  href={`/lexicon/${word.id}`}
                  className="bg-white rounded-lg border border-amber-100 px-4 py-3 hover:shadow-md hover:border-green-300 transition-all flex items-center justify-between gap-2 group"
                >
                  <span className="text-green-900 font-semibold text-sm leading-relaxed group-hover:text-green-700">
                    {word.text}
                  </span>
                  <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {Number(word.children_count) > 0 && (
                      <span className="text-[10px] text-amber-600 bg-amber-50 rounded-full px-1.5 py-0.5 whitespace-nowrap">
                        {Number(word.children_count)} صيغة
                      </span>
                    )}
                    {word.has_citations && (
                      <span className="text-[10px] text-green-700 bg-green-50 rounded-full px-1.5 py-0.5">
                        شواهد
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>

            {words.length === 0 && (
              <div className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border border-gray-100">
                لا توجد مداخل لهذا الحرف
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-6 flex items-center justify-center gap-2 flex-wrap">
                {page > 1 && (
                  <Link
                    href={`/lexicon?letter=${selectedLetter.id}&page=${page - 1}`}
                    className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
                  >
                    السابق
                  </Link>
                )}
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 3, totalPages - 6))
                  const p = start + i
                  if (p > totalPages) return null
                  return (
                    <Link
                      key={p}
                      href={`/lexicon?letter=${selectedLetter!.id}&page=${p}`}
                      className={`px-3 py-2 rounded-lg border text-sm ${
                        p === page
                          ? 'bg-green-800 text-white border-green-800'
                          : 'border-gray-200 bg-white text-green-800 hover:border-green-300'
                      }`}
                    >
                      {p.toLocaleString('ar-EG')}
                    </Link>
                  )
                })}
                {page < totalPages && (
                  <Link
                    href={`/lexicon?letter=${selectedLetter.id}&page=${page + 1}`}
                    className="px-4 py-2 rounded-lg border border-gray-200 bg-white text-green-800 hover:border-green-300 text-sm"
                  >
                    التالي
                  </Link>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center">
            <p className="text-green-900 font-semibold mb-1">
              اختر حرفاً من الفهرس أعلاه لتصفح المداخل
            </p>
            <p className="text-sm text-gray-500 mt-1">
              يضم هذا المعجم{' '}
              <span className="font-bold text-green-800">
                {totalWords.toLocaleString('ar-EG')}
              </span>{' '}
              مدخلاً لألفاظ غريبة واردة في الحديث النبوي الشريف
            </p>
          </div>
        )}
      </div>

      {/* Info note */}
      <div className="mt-8 bg-green-50 border border-green-100 rounded-xl p-4 text-xs text-green-800">
        <p className="font-semibold mb-1">ما هو غريب الحديث؟</p>
        <p className="leading-relaxed">
          علم غريب الحديث يُعنى بشرح الألفاظ الغريبة والنادرة الواردة في أحاديث النبي
          صلى الله عليه وسلم وآثار الصحابة. ومن أبرز كتبه: "النهاية في غريب الحديث والأثر"
          لابن الأثير، و"غريب الحديث" لأبي عبيد القاسم بن سلاّم.
        </p>
      </div>
    </div>
  )
}
