import { stripXmlToVerbatim, stripXmlKeepEdges } from '@/lib/hadithText'

export interface SanadSegment {
  kind: 'text' | 'narrator'
  text: string
  narratorId?: number
}

export interface SanadNarratorPreview {
  id: number
  name: string
  abb_name: string | null
  kunia: string | null
  tabaqa: string | null
  death_year: string | null
  death_year_num: number | null
  martaba_ibn_hajar: string | null
  martaba_zahabi: string | null
  is_companion: boolean
}

const NARRATOR_TAG_RE =
  /<(?:راوي|علم_رجل)([^>]*)>([\s\S]*?)<\/(?:راوي|علم_رجل)>/g

/** Parse sanad XML into verbatim text and narrator-linked spans (ربط = narrators.id). */
export function parseSanadNarratorSegments(xml: string): SanadSegment[] {
  if (!xml) return []

  const matnStart = xml.search(/<متن[\s>]/)
  const scope = matnStart >= 0 ? xml.slice(0, matnStart) : xml

  const segments: SanadSegment[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null

  NARRATOR_TAG_RE.lastIndex = 0
  while ((m = NARRATOR_TAG_RE.exec(scope)) !== null) {
    if (m.index > lastIndex) {
      // Keep edge whitespace so the name doesn't glue onto the surrounding words
      const plain = stripXmlKeepEdges(scope.slice(lastIndex, m.index))
      if (plain) segments.push({ kind: 'text', text: plain })
    }

    const refMatch = m[1].match(/ربط\s*=\s*"(\d+)"/)
    const narratorId = refMatch ? parseInt(refMatch[1], 10) : undefined
    const nameText = stripXmlToVerbatim(m[2])
    if (nameText) {
      segments.push({
        kind: 'narrator',
        text: nameText,
        narratorId: narratorId && !isNaN(narratorId) ? narratorId : undefined,
      })
    }

    lastIndex = m.index + m[0].length
  }

  if (lastIndex < scope.length) {
    const plain = stripXmlKeepEdges(scope.slice(lastIndex))
    if (plain) segments.push({ kind: 'text', text: plain })
  }

  if (segments.length === 0) {
    const fallback = stripXmlToVerbatim(scope)
    if (fallback) segments.push({ kind: 'text', text: fallback })
  }

  return ensureWordBoundaries(segments)
}

// Closing punctuation hugs the previous token (no space before it).
const HUGS_PREV = /^[\s،؛؟.!:،,)\]}»”’"']/
// Opening punctuation hugs the next token (no space after it).
const HUGS_NEXT = /[([{«“]$/

/**
 * Guarantee a word boundary between adjacent segments by inserting a plain (non-bold)
 * space wherever one is missing — so a narrator name never glues onto a neighbouring
 * word. The space is its own text segment so it stays outside the highlighted name span.
 */
function ensureWordBoundaries(segments: SanadSegment[]): SanadSegment[] {
  const out: SanadSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const cur = segments[i]
    const prev = segments[i - 1]
    if (
      prev?.text &&
      cur.text &&
      !/\s$/.test(prev.text) &&
      !HUGS_PREV.test(cur.text) &&
      !HUGS_NEXT.test(prev.text)
    ) {
      out.push({ kind: 'text', text: ' ' })
    }
    out.push(cur)
  }
  return out
}

export function sanadSegmentsHaveNarrators(segments: SanadSegment[]): boolean {
  return segments.some(s => s.kind === 'narrator' && s.narratorId != null)
}
