import pool from '@/lib/db'

/**
 * Match lines for result lists.
 *
 * A result card that shows only the tarf hides a match buried in a long matn, so pages that search
 * the matn attach a concordance-style line to each row: the opening words, then every place the
 * query matches with a couple of words either side, elided with '…', the matched words marked.
 *
 *     حَدَّثَنَا عَمْرُو بْنُ … " أَقِيمُوا [الصَّلَاةَ] وَآتُوا [الزَّكَاةَ] أَقِيمُوا [الصَّلَاةَ] …
 *
 * Shared between /api/search and /hadiths/advanced-research so there is one implementation.
 *
 * Rules that matter if this is touched again:
 *  - the needles are normalised by the database's own normalize_hadith, so the comparison uses
 *    exactly the normalisation of the indexed text; do not add a TypeScript normaliser;
 *  - display text and comparison text come from the *same* truncated string, because normalising
 *    first shortens it (tashkeel is stripped) and the two word arrays would desynchronise;
 *  - inline metadata is dropped for display only — matching keeps using the full text, so result
 *    sets cannot move because of this module.
 */

/** One token of the match line. `hit` marks a word the query matched. */
export type SnipPart = { t: string; hit: boolean }

type SnipNeedle = { words: string[]; regex: RegExp | null }

const escapeRx = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Comparison form of a word: surrounding punctuation removed, so a needle finds 'الوسوسة' inside
 *  'الوسوسة.' — unlike the search index, the word arrays keep punctuation attached. */
const cleanWord = (w: string): string => w.replace(/^[^\p{L}\p{N}\p{M}]+|[^\p{L}\p{N}\p{M}]+$/gu, '')

/** The stored matn carries HTML entities; unescaped for display only. */
const decodeEntities = (w: string): string =>
  w.replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')

/**
 * Readable matn text, capped. The stored matn carries inline metadata — paragraph ids, page
 * references, and the hadith's own numbers (<رقم_حديث نوع="حرف">1881</رقم_حديث>) — which read as
 * noise in a match line, so they are dropped here. Display only: matching keeps the full text.
 */
export const snipClean = (alias: string): string =>
  `regexp_replace(` +
  `regexp_replace(` +
  `regexp_replace(coalesce(${alias}, ''), '<رقم_حديث[^>]*>[^<]*</رقم_حديث>', ' ', 'g'), ` +
  `'<(رقم_الفقرة|الصفحات|نه|تخريج)[^>]*/>', ' ', 'g'), ` +
  `'<[^>]*>', ' ', 'g')`

/**
 * The two SELECT-list columns a caller adds to its query: the display words and the comparison
 * words of the matn text. Both come from the same truncated source, so index i is the same word in
 * both. Pass the alias of the content column (e.g. 'h.content').
 */
export const snipColumns = (contentAlias: string): string =>
  `regexp_split_to_array(btrim(left(${snipClean(contentAlias)}, 6000)), '\\s+') AS snip_disp,\n` +
  `            regexp_split_to_array(btrim(normalize_hadith(left(${snipClean(contentAlias)}, 6000))), '\\s+') AS snip_norm`

async function snippetNeedles(terms: (string | null | undefined)[]): Promise<SnipNeedle[]> {
  const texts = terms.map(t => (t || '').trim()).filter(Boolean)
  if (!texts.length) return []
  const { rows } = await pool.query(
    `SELECT ${texts.map((_, i) => `normalize_hadith($${i + 1}) AS n${i}`).join(', ')}`,
    texts
  )
  const needles: SnipNeedle[] = []
  texts.forEach((text, i) => {
    const norm = String(rows[0]?.[`n${i}`] ?? '').trim()
    if (!norm) return
    if (/[*?]/.test(text)) {
      // 'صلا*' / 'الصل?' — the same word-scoped reading the matchers use, one word at a time
      const body = norm.split('').map(ch => (ch === '*' ? '.*' : ch === '?' ? '.' : escapeRx(ch))).join('')
      needles.push({ words: [], regex: new RegExp(`^${body}$`) })
    } else {
      needles.push({ words: norm.split(/\s+/).map(cleanWord).filter(Boolean), regex: null })
    }
  })
  return needles
}

export function buildSnippet(disp: string[], norm: string[], needles: SnipNeedle[]): SnipPart[] | null {
  if (!disp.length || disp.length !== norm.length || !needles.length) return null
  const ranges: [number, number][] = []
  for (let i = 0; i < norm.length; i++) {
    if (!norm[i]) continue
    for (const nd of needles) {
      if (nd.regex) {
        if (nd.regex.test(norm[i])) { ranges.push([i, 1]); break }
        continue
      }
      if (!nd.words.length || i + nd.words.length > norm.length) continue
      let ok = true
      for (let k = 0; k < nd.words.length; k++) {
        if (norm[i + k] !== nd.words[k]) { ok = false; break }
      }
      if (ok) { ranges.push([i, nd.words.length]); break }
    }
  }
  if (!ranges.length) return null

  const merged: [number, number][] = []
  for (const [s, len] of ranges) {
    const last = merged[merged.length - 1]
    if (last && s <= last[0] + last[1]) last[1] = Math.max(last[1], s + len - last[0])
    else merged.push([s, len])
  }

  const parts: SnipPart[] = []
  const push = (t: string, hit = false) => parts.push({ t, hit })
  // A window opened for one hit usually contains the others too, so mark by membership in all the
  // merged ranges rather than only the range that opened the window.
  const hitIdx = new Set<number>()
  for (const [s, len] of merged) for (let i = s; i < s + len; i++) hitIdx.add(i)
  // Marks the word's letters only: punctuation and diacritics stay outside the highlight, so the
  // text is still exactly what the matn holds ('فضل [الزكاة].' rather than '[الزكاة.]').
  const pushWord = (i: number) => {
    const w = disp[i]
    if (!hitIdx.has(i)) { push(w); return }
    const m = w.match(/^([^\p{L}\p{N}\p{M}]*)([\s\S]*?)([^\p{L}\p{N}\p{M}]*)$/u)
    if (!m || !m[2]) { push(w); return }
    if (m[1]) push(m[1])
    push(m[2], true)
    if (m[3]) push(m[3])
  }
  // The opening words first (the reader needs to know which hadith this is), but never words the
  // first window is about to show anyway.
  const headEnd = Math.min(3, merged[0][0])
  for (let i = 0; i < headEnd; i++) pushWord(i)
  if (merged[0][0] > headEnd) push('…')

  let shown = headEnd
  let windows = 0
  for (const [s, len] of merged) {
    if (windows >= 3) break
    const from = Math.max(shown, s - 2)
    const to = Math.min(disp.length - 1, s + len - 1 + 2)
    if (from > shown) push('…')
    for (let i = from; i <= to; i++) pushWord(i)
    shown = to + 1
    windows++
  }
  if (shown < disp.length) push('…')
  // Collapse neighbouring ellipses ('… …' reads as a mistake, not an elision).
  return parts.filter((p, i) => !(p.t === '…' && parts[i - 1]?.t === '…'))
}

/**
 * Attach a match line to each row. The row must have been selected with `snipColumns()`; the two
 * arrays are removed and replaced by `snippet`. Rows whose match falls outside the text read for
 * the line get `snippet: null`, and the UI simply shows no line.
 */
export async function attachMatnSnippets<T extends Record<string, any>>(
  rows: T[],
  terms: (string | null | undefined)[]
): Promise<(T & { snippet: SnipPart[] | null })[]> {
  const needles = await snippetNeedles(terms)
  return rows.map(r => {
    const disp: string[] = Array.isArray(r.snip_disp) ? r.snip_disp : []
    const norm: string[] = Array.isArray(r.snip_norm) ? r.snip_norm : []
    delete r.snip_disp
    delete r.snip_norm
    const words = disp
      .map((w, i) => ({ w: decodeEntities(w), n: cleanWord(norm[i] ?? '') }))
      .filter(p => p.w !== '' && p.n !== '')
    return {
      ...r,
      snippet: needles.length && words.length
        ? buildSnippet(words.map(p => p.w), words.map(p => p.n), needles)
        : null,
    }
  })
}
