export const dynamic = 'force-dynamic'

import pool from '@/lib/db'
import Link from 'next/link'
import { notFound } from 'next/navigation'

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
interface LexiconItem {
  id: number
  lexicon_id: number
  text: string
  parent_id: number | null
  left_value: number
  right_value: number
  is_leaf: boolean
  results_count: number
}

interface CitationEntry {
  nb_id: number
  narrator_id: number
  book_name: string
  title: string
  content: string
}

interface WordForm {
  id: number
  text: string
  citation_count: number
}

// ---------------------------------------------------------------
// Helper
// ---------------------------------------------------------------
function truncate(text: string, max = 300): string {
  if (!text) return ''
  const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max) + '…'
}

// ---------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------
async function getFullEntry(itemId: number) {
  // 1. Load the item itself
  const itemRes = await pool.query<LexiconItem>(
    `SELECT * FROM lexicon_items WHERE id = $1`,
    [itemId]
  )
  if (!itemRes.rows[0]) return null
  const item = itemRes.rows[0]

  // 2. Load parent (for breadcrumb and context)
  let parent: LexiconItem | null = null
  if (item.parent_id) {
    const parentRes = await pool.query<LexiconItem>(
      `SELECT * FROM lexicon_items WHERE id = $1`,
      [item.parent_id]
    )
    parent = parentRes.rows[0] || null
  }

  // 3. Load grandparent (the letter node) for navigation
  let letterNode: LexiconItem | null = null
  if (parent?.parent_id) {
    const gpRes = await pool.query<LexiconItem>(
      `SELECT * FROM lexicon_items WHERE id = $1`,
      [parent.parent_id]
    )
    letterNode = gpRes.rows[0] || null
  } else if (parent?.parent_id === 1 || item.parent_id === 1) {
    // item IS a letter node, or parent IS a letter node
    const gp = item.parent_id === 1 ? item : parent
    if (gp) letterNode = gp
  }

  // 4. Load sibling/child word forms
  // If item is a root-form (non-leaf, child of letter): load its leaf children
  // If item is a leaf form: load siblings (other leaves under same parent)
  let wordForms: WordForm[] = []
  if (!item.is_leaf && item.parent_id !== 1) {
    // root-form node: show leaf children
    const formsRes = await pool.query<WordForm>(
      `SELECT li.id, li.text,
              (SELECT COUNT(*)::int FROM lexicon_hadith lh WHERE lh.lexicon_item_id = li.id) AS citation_count
       FROM lexicon_items li
       WHERE li.parent_id = $1
       ORDER BY li.left_value`,
      [itemId]
    )
    wordForms = formsRes.rows
  } else if (item.is_leaf && item.parent_id) {
    // leaf: show siblings
    const siblingsRes = await pool.query<WordForm>(
      `SELECT li.id, li.text,
              (SELECT COUNT(*)::int FROM lexicon_hadith lh WHERE lh.lexicon_item_id = li.id) AS citation_count
       FROM lexicon_items li
       WHERE li.parent_id = $1
       ORDER BY li.left_value`,
      [item.parent_id]
    )
    wordForms = siblingsRes.rows
  }

  // 5. Load citations (via narrator_biography — the correct join)
  // We look up both the item and its children so root-form pages show citations too
  const targetIds = [itemId]
  if (!item.is_leaf) {
    // include leaf children
    wordForms.forEach(f => targetIds.push(f.id))
  }

  const [citationsRes, countRes] = await Promise.all([
    pool.query<CitationEntry & { lexicon_item_id: number; item_text: string }>(
      `SELECT
           lh.lexicon_item_id,
           li.text AS item_text,
           nb.id   AS nb_id,
           nb.narrator_id,
           nb.book_name,
           nb.title,
           nb.content
       FROM lexicon_hadith lh
       JOIN narrator_biography nb ON nb.id = lh.hadith_id
       JOIN lexicon_items li ON li.id = lh.lexicon_item_id
       WHERE lh.lexicon_item_id = ANY($1::int[])
       ORDER BY lh.lexicon_item_id, nb.id
       LIMIT 30`,
      [targetIds]
    ),
    pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM lexicon_hadith
       WHERE lexicon_item_id = ANY($1::int[])`,
      [targetIds]
    ),
  ])

  return {
    item,
    parent,
    letterNode,
    wordForms,
    citations: citationsRes.rows,
    totalCitations: countRes.rows[0]?.cnt || 0,
  }
}

// ---------------------------------------------------------------
// Page component
// ---------------------------------------------------------------
export default async function LexiconEntryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const itemId = parseInt(id)
  if (isNaN(itemId)) notFound()

  const data = await getFullEntry(itemId)
  if (!data) notFound()

  const { item, parent, letterNode, wordForms, citations, totalCitations } = data

  // Resolve the letter for the back-link
  // Letter node is the one with parent_id = 1
  const backLetterId =
    letterNode?.parent_id === 1 ? letterNode.id :
    parent?.parent_id === 1 ? parent.id :
    item.parent_id === 1 ? item.id :
    null

  // The "root word" display: for a leaf the parent is the root word;
  // for a non-leaf with parent = letter, the item itself is the root word.
  const rootWord = item.is_leaf ? parent : item
  const letterNodeDisplay = item.is_leaf ? letterNode : (parent?.parent_id === 1 ? parent : letterNode)

  return (
    <div dir="rtl">
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-500 mb-6 flex items-center gap-1 flex-wrap">
        <Link href="/lexicon" className="text-green-700 hover:underline">
          غريب الحديث
        </Link>
        {letterNodeDisplay && (
          <>
            <span className="text-gray-300 mx-1">›</span>
            <Link
              href={`/lexicon?letter=${backLetterId ?? letterNodeDisplay.id}`}
              className="text-green-700 hover:underline"
            >
              حرف {letterNodeDisplay.text}
            </Link>
          </>
        )}
        {rootWord && rootWord.id !== item.id && (
          <>
            <span className="text-gray-300 mx-1">›</span>
            <Link href={`/lexicon/${rootWord.id}`} className="text-green-700 hover:underline">
              {rootWord.text}
            </Link>
          </>
        )}
        <span className="text-gray-300 mx-1">›</span>
        <span className="text-gray-700 font-medium">{item.text}</span>
      </nav>

      {/* Word header */}
      <div className="bg-white rounded-xl border border-amber-200 shadow-sm px-8 py-8 mb-8 text-center">
        <h1 className="text-5xl font-bold text-green-900 mb-3 leading-tight">{item.text}</h1>
        {rootWord && rootWord.id !== item.id && (
          <p className="text-gray-500 text-base mb-2">
            صيغة من مادة{' '}
            <Link href={`/lexicon/${rootWord.id}`} className="text-green-700 font-semibold hover:underline">
              {rootWord.text}
            </Link>
          </p>
        )}
        {totalCitations > 0 && (
          <p className="text-amber-700 text-sm mt-2">
            <span className="font-bold">{totalCitations.toLocaleString('ar-EG')}</span>{' '}
            شاهد في كتب الحديث والرجال
          </p>
        )}
      </div>

      {/* Word forms / siblings */}
      {wordForms.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-green-800 mb-3">
            {item.is_leaf ? 'صيغ أخرى من هذه المادة' : 'الصيغ الواردة في الحديث'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {wordForms.map(form => (
              <Link
                key={form.id}
                href={`/lexicon/${form.id}`}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${
                  form.id === item.id
                    ? 'bg-green-800 text-white border-green-800'
                    : 'bg-white text-green-900 border-amber-200 hover:border-green-400 hover:shadow-sm'
                }`}
              >
                {form.text}
                {Number(form.citation_count) > 0 && (
                  <span
                    className={`text-[10px] rounded-full px-1.5 ${
                      form.id === item.id
                        ? 'bg-green-700 text-green-100'
                        : 'bg-amber-50 text-amber-600'
                    }`}
                  >
                    {Number(form.citation_count)}
                  </span>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Citations (narrator_biography entries) */}
      {citations.length > 0 ? (
        <div>
          <h2 className="text-xl font-bold text-green-800 mb-1">
            مواضع ورود اللفظ في كتب الحديث والرجال
          </h2>
          {totalCitations > 30 && (
            <p className="text-sm text-gray-500 mb-4">
              (عرض أول 30 من {totalCitations.toLocaleString('ar-EG')})
            </p>
          )}
          <div className="grid gap-3 mt-4">
            {citations.map(c => (
              <div
                key={c.nb_id}
                className="bg-white rounded-lg border border-gray-100 px-5 py-4 hover:shadow-sm hover:border-amber-200 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-green-700 font-semibold">{c.book_name}</span>
                      {c.item_text && c.item_text !== item.text && (
                        <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          الصيغة: {c.item_text}
                        </span>
                      )}
                    </div>
                    {c.title && (
                      <p className="text-sm font-medium text-gray-800 mb-1 leading-snug">
                        {truncate(c.title, 120)}
                      </p>
                    )}
                    {c.content && (
                      <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                        {truncate(c.content, 280)}
                      </p>
                    )}
                  </div>
                  {c.narrator_id && (
                    <Link
                      href={`/narrator/${c.narrator_id}`}
                      className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-2 py-1 hover:bg-green-100 transition-colors shrink-0 whitespace-nowrap"
                    >
                      ترجمة الراوي
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-12 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-base">لا توجد شواهد مسجّلة لهذا اللفظ</p>
          <p className="text-sm mt-1">
            يمكنك البحث عن هذا اللفظ في{' '}
            <Link href="/search" className="text-green-700 hover:underline">
              البحث النصي
            </Link>
          </p>
        </div>
      )}

      {/* Back link */}
      <div className="mt-8 pt-6 border-t border-gray-100">
        <Link href="/lexicon" className="text-green-700 hover:underline text-sm">
          ← العودة إلى معجم غريب الحديث
        </Link>
      </div>
    </div>
  )
}
