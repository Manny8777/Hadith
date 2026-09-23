function decodeEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code, 10)))
}

function cleanXmlTags(xml: string): string {
  return decodeEntities(
    (xml || '')
      .replace(/<سند_مخفي[\s\S]*?<\/سند_مخفي>/g, '')
      .replace(/<رقم_حديث[^>]*>[\s\S]*?<\/رقم_حديث>/g, '')
      .replace(/<رقم_الفقرة[^>]*\/?>/g, '')
      .replace(/<الصفحات[^>]*\/?>/g, '')
      .replace(/<نه\/>/g, ' ')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/^\s*[-–—]\s*/, '')
    .replace(/\s+/g, ' ')
}

export function stripXmlToVerbatim(xml: string): string {
  return cleanXmlTags(xml).trim()
}

/**
 * Like {@link stripXmlToVerbatim} but preserves a single leading/trailing space
 * (no trim). Use when slicing a run into adjacent segments so the word boundaries
 * between a narrator name and its surrounding text survive (otherwise the words
 * render glued together, e.g. "حدثنيالضحاك").
 */
export function stripXmlKeepEdges(xml: string): string {
  return cleanXmlTags(xml)
}

export interface HadithTail {
  text: string
  footnotes: { id: string; text: string }[]
}

const FOOTNOTE_RE = /<FootNote[^>]*\bID="(\d+)"[^>]*>([\s\S]*?)<\/FootNote>/g

/**
 * The part of a record that follows the last </متن>: the author's قول/تكشيف notes and the taḥqīq
 * footnotes. The original renders the whole document in order — its XSL leaves only
 * إضافي/متن_مخفي/سند_مخفي/تعليق_مخفي/ترقيم_حرف empty, prints <الصفحات …/> as «[جزء/صفحة]», <هامش> as a
 * superscript «(n)», the مطبوع hadith number inline, and appends the footnote bodies at the end.
 * This reproduces that, so the ~85% of hadiths whose record continues past the matn stop losing it.
 */
export function renderHadithTail(tailRaw: string): HadithTail {
  const raw = tailRaw || ''
  const footnotes: { id: string; text: string }[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  FOOTNOTE_RE.lastIndex = 0
  while ((m = FOOTNOTE_RE.exec(raw)) !== null) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    footnotes.push({ id: m[1], text: stripXmlToVerbatim(m[2]) })
  }

  const marked = raw
    .replace(/<Margin[^>]*>[\s\S]*?<\/Margin>/g, ' ')
    .replace(/<FootNote[\s\S]*?<\/FootNote>/g, ' ')
    .replace(/<هامش[^>]*ID="(\d+)"[^>]*\/?>(?:\s*<\/هامش>)?/g, ' ($1)')
    .replace(/<الصفحات[^>]*جزء="([^"]*)"[^>]*صفحة="([^"]*)"[^>]*\/?>/g, ' [$1/$2] ')
    .replace(/<رقم_حديث[^>]*نوع="([^"]*)"[^>]*>([\s\S]*?)<\/رقم_حديث>/g,
      (_s: string, kind: string, n: string) => (kind === 'مطبوع' ? ` (${n.trim()}) ` : ' '))

  return { text: stripXmlToVerbatim(marked), footnotes }
}

export function splitSanadMatn(xml: string): { sanad: string; matn: string; tail: string; footnotes: { id: string; text: string }[] } {
  const raw = xml || ''
  const matnStart = raw.search(/<متن[\s>]/)
  if (matnStart === -1) {
    return { sanad: '', matn: stripXmlToVerbatim(raw), tail: '', footnotes: [] }
  }

  const matnRe = /<متن[^>]*>([\s\S]*?)<\/متن>/g
  const matnParts: string[] = []
  let match: RegExpExecArray | null
  let lastEnd = -1
  while ((match = matnRe.exec(raw)) !== null) {
    matnParts.push(match[1])
    lastEnd = matnRe.lastIndex
  }

  const { text: tail, footnotes } = renderHadithTail(lastEnd >= 0 ? raw.slice(lastEnd) : '')

  return {
    sanad: stripXmlToVerbatim(raw.slice(0, matnStart)),
    matn: stripXmlToVerbatim(matnParts.join(' ')),
    tail,
    footnotes,
  }
}

/** Extract matn-only text for word comparison — never includes sanad. */
export function extractMatnForComparison(xml: string): string {
  if (!xml) return ''

  const matnRe = /<متن[^>]*>([\s\S]*?)<\/متن>/g
  const parts: string[] = []
  let match: RegExpExecArray | null
  while ((match = matnRe.exec(xml)) !== null) parts.push(match[1])

  let src = ''
  if (parts.length > 0) {
    src = parts.join(' ')
  } else {
    const matnStart = xml.search(/<متن[\s>]/)
    if (matnStart !== -1) {
      const afterOpen = xml.slice(matnStart).replace(/^<متن[^>]*>/, '')
      const closeIdx = afterOpen.indexOf('</متن>')
      src = closeIdx >= 0 ? afterOpen.slice(0, closeIdx) : afterOpen
    }
  }

  if (!src) return ''

  return src
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 10)))
    .replace(/[0-9٠-٩]+/g, ' ')
    .replace(/[-–—]/g, ' ')
    .replace(/[،؛؟,.;:!?()\[\]{}"'«»""'']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
