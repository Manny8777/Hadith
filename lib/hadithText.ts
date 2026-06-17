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

export function splitSanadMatn(xml: string): { sanad: string; matn: string } {
  const raw = xml || ''
  const matnStart = raw.search(/<متن[\s>]/)
  if (matnStart === -1) {
    return { sanad: '', matn: stripXmlToVerbatim(raw) }
  }

  const matnRe = /<متن[^>]*>([\s\S]*?)<\/متن>/g
  const matnParts: string[] = []
  let match: RegExpExecArray | null
  while ((match = matnRe.exec(raw)) !== null) matnParts.push(match[1])

  return {
    sanad: stripXmlToVerbatim(raw.slice(0, matnStart)),
    matn: stripXmlToVerbatim(matnParts.join(' ')),
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
