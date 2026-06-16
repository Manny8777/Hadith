/** Shared types and helpers for غريب الحديث (Gharib al-Hadith). */

export interface GhareebTag {
  word: string
  refId: number | null
}

/** Extract غريب-tagged words from matn XML (authoritative source in hadith text). */
export function parseGhareebTags(xml: string): GhareebTag[] {
  if (!xml) return []

  const matnStart = xml.search(/<متن[\s>]/)
  const scope = matnStart >= 0 ? xml.slice(matnStart) : xml

  const tags: GhareebTag[] = []
  const re = /<غريب[^>]*?(?:ربط="(\d+)")?[^>]*>([\s\S]*?)<\/غريب>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(scope)) !== null) {
    const word = m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    if (!word) continue
    const refRaw = m[1]?.trim()
    const refId = refRaw && /^\d+$/.test(refRaw) ? parseInt(refRaw, 10) : null
    tags.push({ word, refId })
  }
  return tags
}

export function dedupeGhareebWords(words: GhareebWord[]): GhareebWord[] {
  const seen = new Set<number>()
  return words.filter(w => {
    if (seen.has(w.formId)) return false
    seen.add(w.formId)
    return true
  })
}

export interface GhareebSource {
  /** Short excerpt for the inline غريب section */
  definition: string | null
  /** Full verbatim scholar text for hover popover */
  verbatimText: string | null
  sourceBook: string | null
  sourceRefId: number | null
}

export interface GhareebWord {
  formId: number
  formText: string
  wordId: number
  wordText: string
  /** Primary definition (first source) — kept for popover shorthand */
  definition: string | null
  sourceBook: string | null
  sourceRefId: number | null
  sources: GhareebSource[]
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

/** Diacritics only — ranges must not span U+0620–U+064A (Arabic letters). */
export const ARABIC_DIACRITICS_RE =
  /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08F0-\u08FF]/g

const OPTIONAL_DIACRITICS = '[\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06ED\\u08F0-\\u08FF\\s]*'

export function stripTashkeel(text: string): string {
  return text.replace(ARABIC_DIACRITICS_RE, '')
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

  const parts = [...base].map(ch => `${escapeRegex(ch)}${OPTIONAL_DIACRITICS}`)
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

/** Strip service-content XML to readable verbatim Arabic (matches service-content page). */
export function parseServiceVerbatim(raw: string | null | undefined): string | null {
  if (!raw) return null
  return raw
    .replace(/<نه\/>/g, '\n')
    .replace(/<آية[^>]*>([^<]*)<\/آية>/g, '\u{FD3E}$1\u{FD3F}')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .trim() || null
}

/** Extract the scholar's gloss after a <غريب ربط="id"> tag inside service content. */
export function extractGhareebRefSnippet(
  xml: string | null | undefined,
  refId: number
): string | null {
  if (!xml || !refId) return null

  const openRe = new RegExp(
    `<غريب[^>]*ربط="${refId}"[^>]*>([\\s\\S]*?)<\\/غريب>`,
    'i'
  )
  const m = openRe.exec(xml)
  if (!m) return null

  const word = m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  const afterStart = m.index + m[0].length
  const tail = xml
    .slice(afterStart)
    .replace(/^(\s*<\/[^>]+>\s*)+/, '')
  const endMatch = tail.match(/<نه\/>|<مسألة>|<متن[\s>]/)
  const gloss = (endMatch ? tail.slice(0, endMatch.index) : tail)
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!word && !gloss) return null
  return gloss ? `${word} — ${gloss}` : word
}

export function buildGhareebSourceFromRef(
  row: {
    part_text?: string | null
    tarf?: string | null
    content?: string | null
    source_book?: string | null
    source_ref_id?: number | null
  },
  refId: number
): GhareebSource | null {
  const snippet = extractGhareebRefSnippet(row.content, refId)
  const fullVerbatim = parseServiceVerbatim(row.content)
  const verbatimText = snippet || fullVerbatim
  if (!verbatimText && !row.source_book) return null

  const definition =
    snippet ||
    cleanDefinition(row.part_text) ||
    cleanDefinition(row.tarf) ||
    fullVerbatim

  return {
    definition,
    verbatimText,
    sourceBook: row.source_book ?? null,
    sourceRefId: row.source_ref_id ?? null,
  }
}

export function buildGhareebSource(row: {
  part_text?: string | null
  tarf?: string | null
  content?: string | null
  source_book?: string | null
  source_ref_id?: number | null
}): GhareebSource | null {
  const verbatim =
    parseServiceVerbatim(row.content) ||
    cleanDefinition(row.tarf) ||
    cleanDefinition(row.part_text)

  if (!verbatim && !row.source_book) return null

  const definition =
    cleanDefinition(row.part_text) ||
    cleanDefinition(row.tarf) ||
    verbatim

  return {
    definition,
    verbatimText: verbatim,
    sourceBook: row.source_book ?? null,
    sourceRefId: row.source_ref_id ?? null,
  }
}

export function buildGhareebWord(
  row: { formId: number; formText: string; wordId: number; wordText: string },
  sources: GhareebSource[]
): GhareebWord {
  const primary = sources[0] ?? {
    definition: null,
    verbatimText: null,
    sourceBook: null,
    sourceRefId: null,
  }
  return {
    formId: row.formId,
    formText: row.formText,
    wordId: row.wordId,
    wordText: row.wordText,
    definition: primary.definition,
    sourceBook: primary.sourceBook,
    sourceRefId: primary.sourceRefId,
    sources,
  }
}

/** SQL fragment: CTE `lexicon_scope` must be defined with `$1` = lexicon item id. */
export const LEXICON_SCOPE_CTE = `
  lexicon_scope AS (
    SELECT id FROM lexicon_items WHERE id = $1
    UNION
    SELECT id FROM lexicon_items WHERE parent_id = $1
  )
`
