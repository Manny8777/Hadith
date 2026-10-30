'use client'

// What the offline reader asks of the database on the device (SQLite, built by
// scripts/offline/build_offline_db.py). The SQL follows the site's own pages, in SQLite's dialect;
// booleans are stored as 1/0 and Postgres arrays as their text form ('{1,2,3}').
import { offlineQuery as q } from './client'
import { DORAR_SOURCES, dorarKey } from '@/lib/dorar'

// normalize_hadith(): tashkeel removed, أ/إ/آ → ا, ة → ه, ى → ي — the search indexes hold text folded this way
export function normalizeHadith(s: string): string {
  return s.replace(/[ً-ٰٟٱ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
}

export type MatchMode = 'phrase' | 'all' | 'any'

/** An FTS5 query from the reader's words. A trailing * keeps its meaning (words starting with…). */
export function ftsQuery(text: string, mode: MatchMode): string | null {
  const words = normalizeHadith(text)
    .split(/[^\p{L}\p{N}*]+/u)
    .map(w => w.replace(/\*+/g, '*'))
    .filter(w => w.replace(/\*/g, '').length > 0)
  if (!words.length) return null
  const term = (w: string) => (w.endsWith('*') ? `"${w.replace(/\*/g, '')}"*` : `"${w.replace(/\*/g, '')}"`)
  if (mode === 'phrase' && words.length > 1 && !words.some(w => w.endsWith('*'))) return `"${words.join(' ')}"`
  return words.map(term).join(mode === 'any' ? ' OR ' : ' ')
}

export const plainText = (xml: string | null | undefined) =>
  (xml || '').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim()

export interface BookRow { id: number; title: string; author: string | null; hadith_count: number }

export const listBooks = () => q<BookRow>(
  `SELECT b.id, b.title, a.short_name AS author,
          (SELECT COUNT(*) FROM hadith_toc h WHERE h.book_id = b.id AND h.is_leaf = 1 AND h.is_paragraph = 1) AS hadith_count
   FROM books b LEFT JOIN authors a ON a.id = b.author_id
   WHERE EXISTS (SELECT 1 FROM hadith_toc h WHERE h.book_id = b.id)
   ORDER BY b.strong, b.id`)

export interface TocNode {
  main_id: number; parent_id: number | null; content: string | null; chapter_text: string | null
  section_text: string | null; left_value: number; right_value: number; is_leaf: number
}

export const nodeTitle = (n: Pick<TocNode, 'content' | 'chapter_text' | 'section_text'>) =>
  plainText(n.content) || plainText(n.chapter_text) || plainText(n.section_text) || '—'

export async function getBook(id: number) {
  const [book] = await q<{ id: number; title: string; summary: string | null; author: string | null }>(
    `SELECT b.id, b.title, b.summary, a.name AS author FROM books b LEFT JOIN authors a ON a.id = b.author_id WHERE b.id = ?`, [id])
  return book ?? null
}

export async function getSection(bookId: number, sectionId: number | null) {
  let section: TocNode | undefined
  if (sectionId) {
    [section] = await q<TocNode>(`SELECT * FROM hadith_toc WHERE main_id = ? AND book_id = ?`, [sectionId, bookId])
  }
  if (!section) {
    [section] = await q<TocNode>(
      `SELECT * FROM hadith_toc WHERE book_id = ? AND (parent_id = 0 OR parent_id IS NULL) ORDER BY left_value LIMIT 1`, [bookId])
  }
  if (!section) return null
  const children = await q<TocNode & { hadith_count: number }>(
    `SELECT t.main_id, t.parent_id, t.content, t.chapter_text, t.section_text, t.left_value, t.right_value, t.is_leaf,
            (SELECT COUNT(*) FROM hadith_toc h WHERE h.book_id = t.book_id AND h.is_leaf = 1 AND h.is_paragraph = 1
               AND h.left_value > t.left_value AND h.left_value < t.right_value) AS hadith_count
     FROM hadith_toc t WHERE t.book_id = ? AND t.parent_id = ? AND t.is_leaf = 0 ORDER BY t.left_value`,
    [bookId, section.main_id])
  const crumbs: TocNode[] = []
  let cur = section.parent_id
  for (let i = 0; cur && i < 12; i++) {
    const [p] = await q<TocNode>(`SELECT * FROM hadith_toc WHERE main_id = ?`, [cur])
    if (!p || !p.parent_id) break
    crumbs.unshift(p)
    cur = p.parent_id
  }
  return { section, children, crumbs }
}

export interface HadithListRow { main_id: number; tarf: string | null; content: string | null; tarqeem_matboa1: string | null; tarqeem_harf: string | null }

export async function sectionHadiths(bookId: number, section: TocNode, page: number, limit = 20) {
  const where = `book_id = ? AND is_leaf = 1 AND is_paragraph = 1 AND left_value > ? AND left_value < ?`
  const args = [bookId, section.left_value, section.right_value]
  const [rows, [{ n }]] = await Promise.all([
    q<HadithListRow>(`SELECT main_id, tarf, content, tarqeem_matboa1, tarqeem_harf FROM hadith_toc WHERE ${where} ORDER BY left_value LIMIT ? OFFSET ?`,
      [...args, limit, (page - 1) * limit]),
    q<{ n: number }>(`SELECT COUNT(*) AS n FROM hadith_toc WHERE ${where}`, args),
  ])
  return { rows, total: n }
}

export interface HadithRow {
  main_id: number; book_id: number; book_title: string; content: string | null; tarf: string | null
  parent_id: number | null; tarqeem_matboa1: string | null; tarqeem_harf: string | null
  next_paragraph_id: number | null; prev_paragraph_id: number | null; part_num: number | null; page_num: number | null
}

export async function getHadith(id: number) {
  const [h] = await q<HadithRow>(
    `SELECT h.main_id, h.book_id, b.title AS book_title, h.content, h.tarf, h.parent_id, h.tarqeem_matboa1, h.tarqeem_harf,
            h.next_paragraph_id, h.prev_paragraph_id, h.part_num, h.page_num
     FROM hadith_toc h JOIN books b ON b.id = h.book_id WHERE h.main_id = ?`, [id])
  if (!h) return null

  const [judgments, chains, parent, translations] = await Promise.all([
    q<{ say_text: string; scientist: string | null; scientist_id: number | null }>(
      `SELECT j.say_text, n.name AS scientist, j.scientist_id FROM hadith_judgments j
       LEFT JOIN narrators n ON n.id = j.scientist_id WHERE j.hadith_id = ? ORDER BY j.id`, [id]),
    q<{ narrator_ids: string | null }>(
      `SELECT ic.narrator_ids FROM isnad_hadiths ih JOIN isnad_chains ic ON ic.id = ih.isnad_id WHERE ih.hadith_id = ?`, [id]),
    h.parent_id ? q<TocNode>(`SELECT * FROM hadith_toc WHERE main_id = ?`, [h.parent_id]) : Promise.resolve([] as TocNode[]),
    q<{ source: string; collection: string; hadith_number: string }>(
      `SELECT source, collection, hadith_number FROM hadith_translations WHERE main_id = ? LIMIT 3`, [id]).catch(() => []),
  ])

  // Dorar's ruling, for the books it covers (the same key as the site: the printed number)
  let dorar: { hukm: string | null; muhaddith: string | null } | null = null
  const key = DORAR_SOURCES[Number(h.book_id)] ? dorarKey(h.content) : null
  if (key) {
    [dorar] = await q<{ hukm: string | null; muhaddith: string | null }>(
      `SELECT hukm, muhaddith FROM dorar_rulings WHERE book_id = ? AND number = ? ORDER BY dorar_source_id IS NULL, dorar_source_id LIMIT 1`,
      [h.book_id, key])
  }

  // The narrators of its chains, in chain order
  const ids = new Set<number>()
  const chainIds = chains.map(c => (c.narrator_ids || '').match(/\d+/g)?.map(Number) ?? [])
  chainIds.forEach(c => c.forEach(n => ids.add(n)))
  const narrators = ids.size
    ? await q<NarratorBrief>(`SELECT ${NARRATOR_BRIEF} FROM narrators WHERE id IN (${[...ids].map(() => '?').join(',')})`, [...ids])
    : []

  return { hadith: h, judgments, chains: chainIds, narrators, section: parent[0] ?? null, dorar: dorar ?? null, translations }
}

export interface NarratorBrief {
  id: number; name: string; abb_name: string | null; death_year: string | null; tabaqa: string | null
  martaba_ibn_hajar: string | null; martaba_zahabi: string | null; is_companion: number; hadiths_count: number | null
}
const NARRATOR_BRIEF = `id, name, abb_name, death_year, tabaqa, martaba_ibn_hajar, martaba_zahabi, is_companion, hadiths_count`

export async function getNarrator(id: number) {
  const [n] = await q<NarratorBrief & {
    kunia: string | null; laqab: string | null; nasab: string | null; esm_shuhra: string | null
    birth_year: string | null; death_city: string | null; birth_city: string | null; living_city: string | null
    mazhb: string | null; companion_title: string | null; is_female: number
  }>(`SELECT * FROM narrators WHERE id = ?`, [id])
  if (!n) return null
  const [criticism, teachers, students, bios] = await Promise.all([
    q<{ scientist_name: string | null; say_text: string; garh_label: string | null }>(
      `SELECT COALESCE(scientist_name, 'غير معروف') AS scientist_name, say_text, garh_label
       FROM narrator_criticism WHERE narrator_id = ? ORDER BY scientist_name, say_sort`, [id]),
    q<NarratorBrief & { n: number }>(
      `SELECT n.id, n.name, n.abb_name, n.death_year, n.tabaqa, n.martaba_ibn_hajar, n.martaba_zahabi, n.is_companion, n.hadiths_count, COALESCE(nt.hadiths_count, 0) AS n
       FROM narrator_teachers nt JOIN narrators n ON n.id = nt.shyoukh_id WHERE nt.rawy_id = ? ORDER BY nt.hadiths_count DESC, n.name LIMIT 60`, [id]),
    q<NarratorBrief & { n: number }>(
      `SELECT n.id, n.name, n.abb_name, n.death_year, n.tabaqa, n.martaba_ibn_hajar, n.martaba_zahabi, n.is_companion, n.hadiths_count, COALESCE(nt.hadiths_count, 0) AS n
       FROM narrator_teachers nt JOIN narrators n ON n.id = nt.rawy_id WHERE nt.shyoukh_id = ? ORDER BY nt.hadiths_count DESC, n.name LIMIT 60`, [id]),
    q<{ id: number; book_name: string | null; title: string | null; content: string | null }>(
      `SELECT MIN(id) AS id, book_name, title, content FROM narrator_biography WHERE narrator_id = ? GROUP BY main_id ORDER BY book_name`, [id]),
  ])
  return { narrator: n, criticism, teachers, students, bios }
}

export async function searchNarrators(text: string) {
  const words = normalizeHadith(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if (!words.length) return []
  const match = words.map(w => `"${w}"*`).join(' ')
  return q<NarratorBrief>(
    `SELECT ${NARRATOR_BRIEF.split(', ').map(c => 'n.' + c).join(', ')}
     FROM narrator_fts f JOIN narrators n ON n.id = f.rowid
     WHERE narrator_fts MATCH ? ORDER BY n.hadiths_count DESC LIMIT 60`, [match])
}

export interface SearchHit extends HadithListRow { book_id: number; book_title: string }

export async function searchHadith(text: string, mode: MatchMode, scope: 'all' | 'tarf', page: number, bookId: number | null, limit = 20) {
  const match = ftsQuery(text, mode)
  if (!match) return { rows: [] as SearchHit[], total: 0 }
  const fts = scope === 'tarf' ? 'tarf_fts' : 'hadith_fts'
  const bookClause = bookId ? 'AND h.book_id = ?' : ''
  const args: unknown[] = bookId ? [match, bookId] : [match]
  const [{ n }] = await q<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${fts} f ${bookId ? 'JOIN hadith_toc h ON h.main_id = f.rowid' : ''} WHERE ${fts} MATCH ? ${bookClause}`, args)
  // Books in the site's order (the Sahihs first) — except for very common words, where sorting every
  // match would take seconds on a phone; then the database's own order, which is close to it
  const order = n <= 5000 ? 'b.strong, h.book_id, h.left_value' : 'f.rowid'
  const rows = await q<SearchHit>(
    `SELECT h.main_id, h.book_id, b.title AS book_title, h.tarf, h.content, h.tarqeem_matboa1, h.tarqeem_harf
     FROM ${fts} f JOIN hadith_toc h ON h.main_id = f.rowid JOIN books b ON b.id = h.book_id
     WHERE ${fts} MATCH ? ${bookClause}
     ORDER BY ${order} LIMIT ? OFFSET ?`, [...args, limit, (page - 1) * limit])
  return { rows, total: n }
}

export const listSuras = () => q<{ id: number; name: string; ayat: number }>(
  `SELECT s.id, s.name, (SELECT COUNT(*) FROM quran_ayat a WHERE a.sora_id = s.id) AS ayat FROM quran_suras s ORDER BY s.id`)

export async function getSura(id: number) {
  const [sura] = await q<{ id: number; name: string }>(`SELECT id, name FROM quran_suras WHERE id = ?`, [id])
  if (!sura) return null
  const ayat = await q<{ id: number; aya_num: number; text: string }>(
    `SELECT id, aya_num, text FROM quran_ayat WHERE sora_id = ? ORDER BY aya_num`, [id])
  return { sura, ayat }
}
