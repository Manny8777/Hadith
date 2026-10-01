// The MCP server's tools: read-only views of the encyclopedia. Most reuse the site's own API routes
// (called on this server itself), so the answers match what the pages show.
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'

const SITE = 'https://hadith.dev'
const INTERNAL = process.env.INTERNAL_ORIGIN || `http://127.0.0.1:${process.env.PORT || 3000}`

async function api<T>(path: string): Promise<T> {
  const res = await fetch(INTERNAL + path, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

const clip = (s: string | null | undefined, n: number) => {
  const t = (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + ' …' : t
}
const int = (v: unknown, def: number, min: number, max: number) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def
}

export interface Tool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  run: (args: Record<string, unknown>) => Promise<unknown>
}

export const TOOLS: Tool[] = [
  {
    name: 'search_hadith',
    title: 'البحث في الأحاديث',
    description: 'Search the hadith texts (matn and tarf) of the encyclopedia — 339,607 hadiths in 245 books — insensitive to tashkeel and hamza forms. Arabic query. Returns hadith ids, book, printed (مطبوع) and Harf numbers, the tarf, and a link. Use get_hadith for the full text.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Arabic words to find, e.g. «إنما الأعمال بالنيات». Consecutive words are matched as a phrase by default.' },
        match: { type: 'string', enum: ['phrase', 'all', 'any'], description: 'phrase (default): words adjacent and in order; all: every word anywhere; any: any of the words.' },
        book_id: { type: 'integer', description: 'Only this book (ids from list_books), e.g. 1 = Sahih al-Bukhari, 2 = Sahih Muslim.' },
        tarf_only: { type: 'boolean', description: 'Search only the openings (أطراف) of hadiths.' },
        limit: { type: 'integer', minimum: 1, maximum: 20, description: 'Results per page (default 10, max 20).' },
        page: { type: 'integer', minimum: 1, description: 'Page of results (default 1).' },
      },
      required: ['query'],
    },
    async run(a) {
      const q = String(a.query ?? '').trim()
      if (q.length < 2) throw new Error('query must be at least 2 characters')
      const p = new URLSearchParams({ q, limit: String(int(a.limit, 10, 1, 20)), page: String(int(a.page, 1, 1, 500)) })
      if (a.match === 'all' || a.match === 'any') p.set('match', a.match)
      if (a.book_id) p.set('book_id', String(int(a.book_id, 0, 1, 100000)))
      if (a.tarf_only) p.set('search_scope', 'tarf')
      const r = await api<{ results: Record<string, unknown>[]; total: number; page: number }>(`/api/search?${p}`)
      return {
        total: r.total, page: r.page,
        results: r.results.map(h => ({
          id: h.main_id, book: h.book_name,
          printed_number: (h.tarqeem_matboa1 as string | null)?.trim() || null,
          harf_number: (h.tarqeem_harf as string | null)?.trim() || null,
          tarf: clip(h.tarf as string, 220),
          grade_hint: h.grade_hint ?? null,
          url: `${SITE}/hadith/${h.main_id}`,
        })),
      }
    },
  },
  {
    name: 'get_hadith',
    title: 'نص الحديث',
    description: 'One hadith in full: its sanad and matn (with tashkeel as printed), book and author, printed (مطبوع) and Harf numbers, part/page, chapter, hadith type (مرفوع/موقوف/مقطوع/مرسل), and al-Durar al-Saniyya\'s ruling summary where one exists (quoted, attributed — never a ruling of this server).',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'The hadith id (from search_hadith, or the number in hadith.dev/hadith/<id>).' } },
      required: ['id'],
    },
    async run(a) {
      const id = int(a.id, 0, 1, 2_000_000_000)
      const r = await pool.query(
        `SELECT ht.main_id, ht.book_id, b.title AS book, b.takhrij_author AS author, b.takhrij_death AS author_death,
                ht.content, ht.chapter_text, ht.part_num, ht.page_num, ht.tarqeem_matboa1, ht.tarqeem_harf, ht.dorar_key
         FROM hadith_toc ht JOIN books b ON b.id = ht.book_id WHERE ht.main_id = $1`, [id])
      const h = r.rows[0]
      if (!h) throw new Error(`no hadith with id ${id}`)
      const [types, rulings] = await Promise.all([
        pool.query<{ isnad_type: number; n: number }>(
          `SELECT isnad_type, COUNT(*)::int AS n FROM isnad_hadiths WHERE hadith_id = $1 AND isnad_type IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`, [id]),
        h.dorar_key
          ? pool.query(`SELECT source, muhaddith, rawi, hukm, dorar_hash FROM dorar_rulings WHERE book_id = $1 AND number = $2 ORDER BY dorar_source_id NULLS LAST`, [h.book_id, h.dorar_key]).catch(() => ({ rows: [] }))
          : { rows: [] },
      ])
      const split = splitSanadMatn(h.content)
      // the book/chapter headings and printed numbers the text can open with («كتاب الطهارة / باب … /
      // 223 498 - حدثنا…») are given separately (chapter, printed_number, harf_number)
      const numbered = split.sanad.match(/^[\s\S]{0,400}?[\d٠-٩]+(?:\s+[\d٠-٩]+)*\s*[-–]\s*/)
      const sanad = (numbered ? split.sanad.slice(numbered[0].length) : split.sanad).replace(/^[\s\d٠-٩()\-–]+/, '')
      const matn = split.matn
      const TYPE: Record<number, string> = { 1: 'مرفوع', 2: 'موقوف', 3: 'مقطوع', 4: 'مرسل' }
      return {
        id: h.main_id, url: `${SITE}/hadith/${h.main_id}`,
        book: h.book, book_id: h.book_id, author: h.author || null, author_death_hijri: h.author_death || null,
        printed_number: h.tarqeem_matboa1?.trim() || null, harf_number: h.tarqeem_harf?.trim() || null,
        part: h.part_num ?? null, page: h.page_num ?? null,
        chapter: clip(h.chapter_text, 300) || null,
        hadith_type: types.rows[0] ? TYPE[types.rows[0].isnad_type] ?? null : null,
        sanad, matn,
        dorar_rulings: rulings.rows.map((d: Record<string, unknown>) => ({
          muhaddith: d.muhaddith, source: d.source, ruling: d.hukm, narrator: d.rawi,
          url: d.dorar_hash ? `https://dorar.net/h/${d.dorar_hash}` : null,
        })),
        dorar_note: rulings.rows.length ? 'Rulings as summarised by al-Durar al-Saniyya (dorar.net), attributed to the muhaddith named.' : undefined,
      }
    },
  },
  {
    name: 'get_parallels',
    title: 'الروايات الموازية (التخريج)',
    description: 'The other narrations of a hadith across the books (its takhrij): each with book, printed number, the start of its matn, and a link. Useful to see where else a hadith is narrated and how its wording varies.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'The hadith id.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Max narrations (default 20, max 50).' },
      },
      required: ['id'],
    },
    async run(a) {
      const id = int(a.id, 0, 1, 2_000_000_000)
      const r = await api<{ parallels: Record<string, unknown>[] }>(`/api/hadith/${id}/parallel`)
      const all = r.parallels ?? []
      return {
        total: all.length,
        parallels: all.slice(0, int(a.limit, 20, 1, 50)).map(p => ({
          id: p.main_id, book: p.book_title, author_death_hijri: p.takhrij_death ?? null,
          printed_number: (p.tarqeem_matboa1 as string | null)?.trim() || null,
          // the matn alone (a record's text can hold a second chain between its matn parts)
          matn: clip(extractMatnForComparison(p.content as string) || (p.tarf as string), 400),
          url: `${SITE}/hadith/${p.main_id}`,
        })),
      }
    },
  },
  {
    name: 'search_narrators',
    title: 'البحث عن راوٍ',
    description: 'Find narrators (رواة) by name among ~30,000: returns id, full and short name, Ibn Hajar\'s grade (مرتبة), tabaqa, death year, whether a Companion.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Arabic name or part of it, e.g. «سفيان».' },
        limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Max results (default 8).' },
      },
      required: ['name'],
    },
    async run(a) {
      const q = String(a.name ?? '').trim()
      if (q.length < 2) throw new Error('name must be at least 2 characters')
      const rows = await api<Record<string, unknown>[]>(`/api/narrators-search?${new URLSearchParams({ q, limit: String(int(a.limit, 8, 1, 10)) })}`)
      return rows.map(n => ({
        id: n.id, name: n.name, short_name: n.abb_name, grade_ibn_hajar: n.martaba_ibn_hajar,
        tabaqa: n.tabaqa, death: n.death_year, companion: n.is_companion, url: `${SITE}/narrator/${n.id}`,
      }))
    },
  },
  {
    name: 'get_narrator',
    title: 'ترجمة راوٍ',
    description: 'A narrator\'s profile: names and kunya, birth/death and cities, tabaqa, grades by Ibn Hajar and al-Dhahabi, number of hadiths, and the books he narrates in.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'Narrator id (from search_narrators).' } },
      required: ['id'],
    },
    async run(a) {
      const id = int(a.id, 0, 1, 2_000_000_000)
      const r = await api<{ narrator: Record<string, unknown>; books?: { id: number; title: string; count?: number }[] }>(`/api/narrator/${id}`)
      if (!r.narrator) throw new Error(`no narrator with id ${id}`)
      const n = r.narrator
      return {
        id: n.id, url: `${SITE}/narrator/${n.id}`, name: n.name, short_name: n.abb_name, kunya: n.kunia,
        birth: n.birth_year || null, death_year_hijri: n.death_year_num ?? null, death_city: n.death_city || null,
        tabaqa: n.tabaqa, grade_ibn_hajar: n.martaba_ibn_hajar || null, grade_dhahabi: n.martaba_zahabi || null,
        companion: n.is_companion, hadiths: n.hadiths_count,
        books: (r.books ?? []).slice(0, 40).map(b => ({ id: b.id, title: b.title, ...(b.count != null ? { hadiths: b.count } : {}) })),
      }
    },
  },
  {
    name: 'list_books',
    title: 'كتب الموسوعة',
    description: 'The hadith books of the encyclopedia with their ids (for search_hadith\'s book_id), authors and authors\' death years.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const rows = await api<Record<string, unknown>[]>(`/api/books?src=hadith`)
      return rows.map(b => ({ id: b.id, title: b.title, author: b.author_short || b.takhrij_author || null, author_death_hijri: b.takhrij_death || null }))
    },
  },
]
