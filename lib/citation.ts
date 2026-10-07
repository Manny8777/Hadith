// Citing a hadith in the formats reference managers read: BibTeX/BibLaTeX (LaTeX, Zotero, JabRef),
// RIS (EndNote, Mendeley, Zotero), CSL-JSON (Zotero, Pandoc), CSV, and the Arabic footnote.
//
// A hadith is cited as a section of its book («book section» / @inbook / RIS CHAP): the book as
// printed — author, publisher and place, edition and year from the book's card — and where the
// hadith is in it: volume, page, the printed (مطبوع) number, chapter. Keys are plain ASCII
// (bukhari3350, muslim8…) so classic BibTeX accepts them; the year is Gregorian (the Hijri year
// of the edition is kept in the edition note).
import pool from '@/lib/db'

export interface CiteItem {
  id: number                 // our hadith id
  key: string                // bukhari3350
  bookId: number
  book: string               // صحيح البخاري
  author: string | null      // محمد بن إسماعيل البخاري (from the card), else the short name
  authorShort: string | null // البخاري
  authorDeath: number | null // Hijri
  editor: string | null
  publisher: string | null
  place: string | null
  edition: string | null     // «الأولى»
  editionYear: string | null // «1422هـ» as printed
  year: number | null        // Gregorian, for sorting and BibTeX
  volume: number | null
  page: number | null
  number: string | null      // printed (مطبوع)
  harf: string | null
  chapter: string | null
  title: string              // «حديث: إنما الأعمال بالنيات…»
  url: string
  // the reader's own, in a collection export
  note?: string | null
  tags?: string[]
}

const SITE = 'https://hadith.dev'
const SLUGS: Record<number, string> = {
  1: 'bukhari', 2: 'muslim', 3: 'abudawud', 4: 'tirmidhi', 5: 'nasai', 6: 'ibnmajah', 7: 'malik', 8: 'ahmad',
  9: 'darimi', 10: 'ibnhibban', 11: 'ibnkhuzaymah', 12: 'tabaranikabir', 13: 'tabaraniawsat', 14: 'tabaranisaghir',
  15: 'ibnabishaybah', 16: 'abdalrazzaq', 17: 'bayhaqikubra', 18: 'daraqutni', 19: 'bazzar', 20: 'humaydi',
  21: 'tayalisi', 22: 'nasaikubra', 23: 'abuyala', 24: 'hakim', 25: 'diyamukhtarah', 26: 'matalibaliyah',
  27: 'ibnjarudmuntaqa', 28: 'tahawimaani', 29: 'abdibnhumayd', 30: 'saidibnmansur', 31: 'tahawimushkil',
  32: 'abudawudmarasil', 33: 'tirmidhishamail',
}

// «<مسألة> اسم الكتاب: … <نه/> اسم المؤلف: … <نه/> الناشر: دار … - بيروت <نه/> الطبعة: الأولى، 1422هـ …»
function parseCard(card: string | null) {
  const lines = (card ?? '').replace(/<\/?مسألة>/g, '').split(/<نه\/>/).map(l => l.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const field = (...names: string[]) => {
    for (const l of lines) for (const n of names) {
      const m = l.match(new RegExp(`^\\*?\\s*${n}\\s*:\\s*(.+)$`))
      if (m) return m[1].trim()
    }
    return null
  }
  const author = field('اسم المؤلف', 'المؤلف')
  const editor = field('المحقق', 'تحقيق', 'حققه', 'المحققون')
  let publisher = field('الناشر')
  let place: string | null = null
  if (publisher) {
    publisher = publisher.replace(/\s*\(.*?\)\s*/g, ' ').trim()
    const parts = publisher.split(/\s+-\s+|،\s*/).map(s => s.trim()).filter(Boolean)
    if (parts.length > 1) { publisher = parts[0]; place = parts.slice(1).join('، ') }
  }
  const editionRaw = field('الطبعة')
  let edition: string | null = null, editionYear: string | null = null, year: number | null = null
  if (editionRaw) {
    const hijri = editionRaw.match(/(\d{3,4})\s*هـ/)
    const greg = editionRaw.match(/(\d{4})\s*م/)
    editionYear = [hijri ? `${hijri[1]}هـ` : null, greg ? `${greg[1]}م` : null].filter(Boolean).join(' / ') || null
    edition = editionRaw.replace(/[،,-]?\s*\d{3,4}\s*(هـ|م)/g, '').replace(/[\s،,-]+$/, '').trim() || null
    year = greg ? Number(greg[1]) : hijri ? Math.round(Number(hijri[1]) * 0.970224 + 621.5774) : null
  }
  return { author, editor, publisher, place, edition, editionYear, year }
}

const words = (s: string | null, n: number) => {
  const w = (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().split(' ')
  return w.length > n ? w.slice(0, n).join(' ') + '…' : w.join(' ')
}

export async function citeItems(ids: number[]): Promise<CiteItem[]> {
  if (!ids.length) return []
  const r = await pool.query(
    `SELECT ht.main_id, ht.book_id, b.title, b.takhrij_author, b.takhrij_death, b.card_info,
            NULLIF(trim(ht.tarqeem_matboa1), '') AS printed, NULLIF(trim(ht.tarqeem_harf), '') AS harf,
            ht.part_num, ht.page_num, ht.section_text, ht.chapter_text, ht.tarf
     FROM hadith_toc ht JOIN books b ON b.id = ht.book_id WHERE ht.main_id = ANY($1::int[])`, [ids])
  const byId = new Map(r.rows.map(x => [x.main_id, x]))
  const used = new Map<string, number>()
  return ids.map(id => byId.get(id)).filter(Boolean).map(x => {
    const card = parseCard(x.card_info)
    const number = x.printed ? String(x.printed).split(/\s/)[0] : null
    const base = `${SLUGS[x.book_id] ?? `book${x.book_id}`}${(number ?? '').replace(/\D/g, '') || `h${x.main_id}`}`
    const seen = used.get(base) ?? 0
    used.set(base, seen + 1)
    const chapter = [x.section_text, x.chapter_text].map((s: string | null) => s?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean).join(' — ') || null
    return {
      id: x.main_id, key: seen ? `${base}${String.fromCharCode(96 + seen)}` : base, bookId: x.book_id, book: x.title,
      author: card.author ?? x.takhrij_author ?? null, authorShort: x.takhrij_author ?? null, authorDeath: x.takhrij_death ?? null,
      editor: card.editor, publisher: card.publisher, place: card.place, edition: card.edition, editionYear: card.editionYear, year: card.year,
      volume: x.part_num > 0 ? x.part_num : null, page: x.page_num > 0 ? x.page_num : null,
      number, harf: x.harf, chapter,
      title: `حديث: ${words(x.tarf, 12) || x.title}`,
      url: `${SITE}/hadith/${x.main_id}`,
    } satisfies CiteItem
  })
}

const today = () => new Date().toISOString().slice(0, 10)
const bib = (s: string) => s.replace(/[{}\\]/g, '').replace(/[%&$#_]/g, m => '\\' + m)

/** BibLaTeX-flavoured BibTeX: classic BibTeX reads it (unknown fields are ignored) */
export function toBibTeX(items: CiteItem[]): string {
  return items.map(it => {
    const f: [string, string | number | null | undefined][] = [
      ['author', it.author], ['title', it.title], ['booktitle', it.book], ['chapter', it.chapter], ['editor', it.editor],
      ['publisher', it.publisher], ['address', it.place], ['location', it.place],
      ['edition', it.edition], ['year', it.year], ['volume', it.volume], ['pages', it.page],
      ['note', [it.number ? `الحديث رقم ${it.number}` : null, it.harf ? `ترقيم حرف ${it.harf}` : null, it.editionYear ? `طبعة ${it.editionYear}` : null, it.authorDeath ? `ت ${it.authorDeath}هـ` : null].filter(Boolean).join('؛ ')],
      ['url', it.url], ['urldate', today()], ['language', 'arabic'], ['langid', 'arabic'],
      ['keywords', it.tags?.join(', ')], ['annote', it.note],
    ]
    const body = f.filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
      .map(([k, v]) => `  ${k.padEnd(9)} = {${bib(String(v))}}`).join(',\n')
    return `@inbook{${it.key},\n${body}\n}`
  }).join('\n\n') + '\n'
}

/** RIS (EndNote, Mendeley, Zotero): a book section per hadith */
export function toRIS(items: CiteItem[]): string {
  const line = (tag: string, v: string | number | null | undefined) => v === null || v === undefined || String(v).trim() === '' ? [] : [`${tag}  - ${String(v).replace(/\r?\n/g, ' ')}`]
  return items.map(it => [
    'TY  - CHAP',
    ...line('ID', it.key),
    ...line('AU', it.author), ...line('A2', it.editor),
    ...line('TI', it.title), ...line('T2', it.book), ...line('SE', it.chapter),
    ...line('PB', it.publisher), ...line('CY', it.place), ...line('ET', it.edition),
    ...line('PY', it.year), ...line('VL', it.volume), ...line('SP', it.page),
    ...line('M1', it.number ? `الحديث رقم ${it.number}` : null),
    ...line('UR', it.url), ...line('Y2', today()), ...line('LA', 'ar'),
    ...line('N1', [it.harf ? `ترقيم حرف ${it.harf}` : null, it.editionYear ? `طبعة ${it.editionYear}` : null].filter(Boolean).join('؛ ')),
    ...(it.tags ?? []).flatMap(t => line('KW', t)),
    ...line('N2', it.note),
    'ER  - ',
  ].join('\r\n')).join('\r\n\r\n') + '\r\n'
}

/** CSL-JSON (Zotero import, Pandoc citeproc) */
export function toCSL(items: CiteItem[]) {
  return items.map(it => ({
    id: it.key, type: 'chapter', title: it.title, 'container-title': it.book,
    author: it.author ? [{ literal: it.author }] : undefined,
    editor: it.editor ? [{ literal: it.editor }] : undefined,
    publisher: it.publisher ?? undefined, 'publisher-place': it.place ?? undefined, edition: it.edition ?? undefined,
    issued: it.year ? { 'date-parts': [[it.year]] } : undefined,
    volume: it.volume ?? undefined, page: it.page ? String(it.page) : undefined,
    'chapter-number': it.number ?? undefined, section: it.chapter ?? undefined,
    URL: it.url, accessed: { 'date-parts': [today().split('-').map(Number)] }, language: 'ar',
    note: [it.number ? `الحديث رقم ${it.number}` : null, it.harf ? `ترقيم حرف ${it.harf}` : null, it.editionYear ? `طبعة ${it.editionYear}` : null, it.note].filter(Boolean).join('\n') || undefined,
    keyword: it.tags?.length ? it.tags.join(', ') : undefined,
  }))
}

const csvCell = (v: unknown) => { const s = v === null || v === undefined ? '' : String(v); return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function toCSV(items: CiteItem[]): string {
  const head = ['key', 'book', 'author', 'volume', 'page', 'printed_number', 'harf_number', 'chapter', 'title', 'publisher', 'edition', 'year', 'url', 'tags', 'note']
  const rows = items.map(it => [it.key, it.book, it.author, it.volume, it.page, it.number, it.harf, it.chapter, it.title, it.publisher, it.edition, it.year, it.url, it.tags?.join('; '), it.note])
  // a byte-order mark so Excel opens the Arabic correctly
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}

/** The Arabic footnote: «أخرجه البخاري في صحيح البخاري (دار طوق النجاة، بيروت، ط. الأولى، 1422هـ)، كتاب…، 4/139، رقم (3350).» */
export function footnote(it: CiteItem): string {
  const pub = [it.publisher, it.place, it.edition ? `ط. ${it.edition}` : null, it.editionYear].filter(Boolean).join('، ')
  const where = [it.chapter, it.volume && it.page ? `${it.volume}/${it.page}` : it.page ? `ص${it.page}` : null, it.number ? `رقم (${it.number})` : it.harf ? `رقم (${it.harf}) بترقيم حرف` : null].filter(Boolean).join('، ')
  return `أخرجه ${it.authorShort ?? it.author ?? ''} في ${it.book}${pub ? ` (${pub})` : ''}${where ? `، ${where}` : ''}.`.replace(/\s+/g, ' ')
}
export const toFootnotes = (items: CiteItem[]) =>
  items.map((it, i) => `${i + 1}. ${footnote(it)}${it.note ? `\n   ملاحظة: ${it.note.replace(/\n/g, ' ')}` : ''}`).join('\n') + '\n'

export const FORMATS = {
  bib: { ext: 'bib', type: 'application/x-bibtex; charset=utf-8', render: toBibTeX },
  ris: { ext: 'ris', type: 'application/x-research-info-systems; charset=utf-8', render: toRIS },
  json: { ext: 'json', type: 'application/vnd.citationstyles.csl+json; charset=utf-8', render: (i: CiteItem[]) => JSON.stringify(toCSL(i), null, 2) },
  csv: { ext: 'csv', type: 'text/csv; charset=utf-8', render: toCSV },
  txt: { ext: 'txt', type: 'text/plain; charset=utf-8', render: toFootnotes },
} as const
export type CiteFormat = keyof typeof FORMATS
export const isFormat = (f: unknown): f is CiteFormat => typeof f === 'string' && f in FORMATS
