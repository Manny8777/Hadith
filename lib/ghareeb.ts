/** Shared types and helpers for غريب الحديث (Gharib al-Hadith). */

export interface GhareebWord {
  formId: number
  formText: string
  wordId: number
  wordText: string
  definition: string | null
  sourceBook: string | null
  sourceRefId: number | null
}

export interface LexiconHadithRef {
  main_id: number
  book_id: number
  book_title: string
  tarf: string | null
  part_num: number | null
  page_num: number | null
  tarqeem_harf: string | null
}

const TASHKEEL_RE = /[ؐ-ًؚ-ٰٟ]/g

export function stripTashkeel(text: string): string {
  return text.replace(TASHKEEL_RE, '')
}

/** Escape special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build a regex that matches `word` in Arabic text, allowing optional diacritics
 * after each base letter (tashkeel-insensitive matching).
 */
export function buildArabicWordPattern(word: string): RegExp {
  const base = stripTashkeel(word).replace(/\s+/g, '')
  if (!base) return /(?!)/

  const parts = [...base].map(ch => `${escapeRegex(ch)}[ؐ-ًؚ-ٰٟ\\s]*`)
  return new RegExp(parts.join(''), 'gu')
}

export interface MatnMatch {
  formId: number
  start: number
  end: number
  matchedText: string
}

/**
 * Find non-overlapping occurrences of ghareeb word forms in matn text.
 * Longer forms are matched first to avoid partial overlaps.
 */
export function findGhareebMatches(
  matn: string,
  words: GhareebWord[]
): MatnMatch[] {
  if (!matn || words.length === 0) return []

  const sorted = [...words].sort(
    (a, b) => stripTashkeel(b.formText).length - stripTashkeel(a.formText).length
  )

  const used: Array<[number, number]> = []
  const matches: MatnMatch[] = []

  for (const w of sorted) {
    const pattern = buildArabicWordPattern(w.formText)
    pattern.lastIndex = 0
    let m: RegExpExecArray | null

    while ((m = pattern.exec(matn)) !== null) {
      const start = m.index
      const end = start + m[0].length
      const overlaps = used.some(([s, e]) => start < e && end > s)
      if (!overlaps) {
        used.push([start, end])
        matches.push({
          formId: w.formId,
          start,
          end,
          matchedText: m[0],
        })
        break
      }
    }
  }

  return matches.sort((a, b) => a.start - b.start)
}

export function cleanDefinition(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || null
}

/** SQL fragment: CTE `lexicon_scope` must be defined with `$1` = lexicon item id. */
export const LEXICON_SCOPE_CTE = `
  lexicon_scope AS (
    SELECT id FROM lexicon_items WHERE id = $1
    UNION
    SELECT id FROM lexicon_items WHERE parent_id = $1
  )
`
