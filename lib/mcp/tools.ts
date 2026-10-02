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

// isnad_hadiths.isnad_type
const TYPE_KEY: Record<number, string> = { 1: 'marfu', 2: 'mawquf', 3: 'maqtu', 4: 'mursal' }

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
    description: 'One hadith in full: its sanad and matn (with tashkeel as printed), book and author, printed (مطبوع) and Harf numbers, part/page, chapter, hadith type (مرفوع/موقوف/مقطوع/مرسل), its chains as lists of narrators with ids (for get_narrator), and al-Durar al-Saniyya\'s ruling summary where one exists (quoted, attributed — never a ruling of this server).',
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
      const [types, rulings, chains] = await Promise.all([
        pool.query<{ isnad_type: number; n: number }>(
          `SELECT isnad_type, COUNT(*)::int AS n FROM isnad_hadiths WHERE hadith_id = $1 AND isnad_type IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`, [id]),
        h.dorar_key
          ? pool.query(`SELECT source, muhaddith, rawi, hukm, dorar_hash FROM dorar_rulings WHERE book_id = $1 AND number = $2 ORDER BY dorar_source_id NULLS LAST`, [h.book_id, h.dorar_key]).catch(() => ({ rows: [] }))
          : { rows: [] },
        // the chains, each as its narrators from the top (the Companion) down, with their ids
        pool.query<{ isnad_type: number | null; narrators: { id: number; name: string }[] | null }>(
          `SELECT ih.isnad_type,
                  (SELECT json_agg(json_build_object('id', n.id, 'name', n.abb_name) ORDER BY u.ord)
                   FROM unnest(ic.narrator_id_array) WITH ORDINALITY u(nid, ord) JOIN narrators n ON n.id = u.nid) AS narrators
           FROM isnad_hadiths ih JOIN isnad_chains ic ON ic.id = ih.isnad_id
           WHERE ih.hadith_id = $1 ORDER BY ih.isnad_id LIMIT 5`, [id]).catch(() => ({ rows: [] })),
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
        chains: chains.rows.map(c => ({ type: c.isnad_type ? TYPE[c.isnad_type] ?? null : null, narrators_top_down: c.narrators ?? [] })),
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
    description: 'A narrator\'s profile: names and kunya, birth/death and cities, tabaqa, the grades of Ibn Hajar and al-Dhahabi, what the imams said of him (جرح وتعديل, quoted and attributed), his main teachers and students, and how often he appears in the chains — overall, by role (heading the chain: مرفوع/موقوف/مقطوع/مرسل; or further down, passing on what others narrate) and book by book. The counts are of hadith entries in the books, repetitions included (the same hadith in al-Bukhari, Muslim and Ahmad counts three times), not distinct hadiths. Use narrator_hadiths to list them.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'integer', description: 'Narrator id (from search_narrators).' } },
      required: ['id'],
    },
    async run(a) {
      const id = int(a.id, 0, 1, 2_000_000_000)
      const nr = await pool.query(
        `SELECT id, name, abb_name, kunia, birth_year, birth_city, death_year_num, death_city, tabaqa,
                martaba_ibn_hajar, martaba_zahabi, is_companion
         FROM narrators WHERE id = $1`, [id])
      const n = nr.rows[0]
      if (!n) throw new Error(`no narrator with id ${id}`)
      // Every entry whose chain holds him — by role and type, and by book. narrator_id_array[1] is
      // the top of the chain (the Companion's end).
      const [roles, books, teachers, students, crit] = await Promise.all([
        pool.query<{ top: boolean; isnad_type: number | null; n: number }>(
          `SELECT ic.narrator_id_array[1] = $1 AS top, ih.isnad_type, COUNT(DISTINCT ih.hadith_id)::int AS n
           FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
           WHERE ic.narrator_id_array @> ARRAY[$1::int] GROUP BY 1, 2`, [id]),
        pool.query<{ id: number; title: string; entries: number; at_top: number; marfu_at_top: number }>(
          `SELECT b.id, b.title, COUNT(DISTINCT ih.hadith_id)::int AS entries,
                  COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ic.narrator_id_array[1] = $1)::int AS at_top,
                  COUNT(DISTINCT ih.hadith_id) FILTER (WHERE ic.narrator_id_array[1] = $1 AND ih.isnad_type = 1)::int AS marfu_at_top
           FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id
           JOIN hadith_toc ht ON ht.main_id = ih.hadith_id JOIN books b ON b.id = ht.book_id
           WHERE ic.narrator_id_array @> ARRAY[$1::int] GROUP BY b.id, b.title ORDER BY entries DESC`, [id]),
        pool.query(
          `SELECT n.id, n.abb_name AS name, nt.hadiths_count::int AS hadiths FROM narrator_teachers nt JOIN narrators n ON n.id = nt.shyoukh_id
           WHERE nt.rawy_id = $1 ORDER BY nt.hadiths_count DESC NULLS LAST LIMIT 10`, [id]),
        pool.query(
          `SELECT n.id, n.abb_name AS name, nt.hadiths_count::int AS hadiths FROM narrator_teachers nt JOIN narrators n ON n.id = nt.rawy_id
           WHERE nt.shyoukh_id = $1 ORDER BY nt.hadiths_count DESC NULLS LAST LIMIT 10`, [id]),
        pool.query<{ scientist_name: string | null; say_text: string | null }>(
          `SELECT scientist_name, say_text FROM narrator_criticism
           WHERE narrator_id = $1 AND say_text IS NOT NULL ORDER BY say_sort, scientist_name LIMIT 40`, [id]),
      ])
      const atTop: Record<string, number> = {}
      let further = 0
      for (const r of roles.rows) {
        if (!r.top) { further += r.n; continue }
        const k = TYPE_KEY[r.isnad_type ?? 0] ?? 'unspecified'
        atTop[k] = (atTop[k] ?? 0) + r.n
      }
      const sayings: { scholar: string; said: string[] }[] = []
      for (const c of crit.rows) {
        const who = c.scientist_name || 'غير مسمّى'
        let e = sayings.find(x => x.scholar === who)
        if (!e) sayings.push(e = { scholar: who, said: [] })
        e.said.push(clip(c.say_text, 300))
      }
      return {
        id: n.id, url: `${SITE}/narrator/${n.id}`, name: n.name, short_name: n.abb_name, kunya: n.kunia || null,
        birth: n.birth_year || null, birth_city: n.birth_city || null,
        death_year_hijri: n.death_year_num ?? null, death_city: n.death_city || null,
        tabaqa: n.tabaqa || null, companion: n.is_companion,
        grades: { ibn_hajar: n.martaba_ibn_hajar || null, dhahabi: n.martaba_zahabi || null },
        what_the_imams_said: sayings,
        hadith_entries: {
          total: books.rows.reduce((s, b) => s + b.entries, 0),
          heading_the_chain: atTop,
          further_down_the_chain: further,
          note: 'Entries in the books, repetitions included — not distinct hadiths. heading_the_chain: he is at the top of the chain (for a Companion, what he narrates: from the Prophet ﷺ when marfu, his own words or deeds when mawquf). further_down_the_chain: he passes on what narrators above him narrate. An entry with several chains can count under more than one heading.',
        },
        by_book: books.rows.map(b => ({ book_id: b.id, title: b.title, entries: b.entries, heading_the_chain: b.at_top, marfu_heading: b.marfu_at_top })),
        teachers: teachers.rows, students: students.rows,
      }
    },
  },
  {
    name: 'narrator_hadiths',
    title: 'أحاديث الراوي',
    description: 'The hadiths a narrator appears in, page by page: id, book, printed and Harf numbers, the tarf, link. Filter by book, by role (top: he heads the chain; any: anywhere in it) and by type (marfu/mawquf/maqtu/mursal) — e.g. a Companion\'s marfu hadiths in Sahih Muslim.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'integer', description: 'Narrator id (from search_narrators).' },
        book_id: { type: 'integer', description: 'Only this book (ids from list_books, or by_book in get_narrator).' },
        role: { type: 'string', enum: ['any', 'top'], description: 'any (default): anywhere in the chain; top: he heads the chain.' },
        type: { type: 'string', enum: ['marfu', 'mawquf', 'maqtu', 'mursal'], description: 'Only chains of this type.' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Results per page (default 20, max 50).' },
        page: { type: 'integer', minimum: 1, description: 'Page (default 1).' },
      },
      required: ['id'],
    },
    async run(a) {
      const id = int(a.id, 0, 1, 2_000_000_000)
      const limit = int(a.limit, 20, 1, 50), page = int(a.page, 1, 1, 10_000)
      const params: unknown[] = [id]
      let where = 'ic.narrator_id_array @> ARRAY[$1::int]'
      if (a.role === 'top') where += ' AND ic.narrator_id_array[1] = $1'
      const type = Object.entries(TYPE_KEY).find(([, k]) => k === a.type)?.[0]
      if (type) { params.push(Number(type)); where += ` AND ih.isnad_type = $${params.length}` }
      let book = ''
      if (a.book_id) { params.push(int(a.book_id, 0, 1, 100000)); book = ` AND ht.book_id = $${params.length}` }
      const ids = `SELECT ih.hadith_id FROM isnad_chains ic JOIN isnad_hadiths ih ON ih.isnad_id = ic.id WHERE ${where}`
      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT ht.main_id, b.title AS book, ht.tarqeem_matboa1, ht.tarqeem_harf, ht.tarf
           FROM hadith_toc ht JOIN books b ON b.id = ht.book_id
           WHERE ht.main_id IN (${ids})${book}
           ORDER BY ht.book_id, ht.main_id LIMIT ${limit} OFFSET ${(page - 1) * limit}`, params),
        pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM hadith_toc ht WHERE ht.main_id IN (${ids})${book}`, params),
      ])
      return {
        total: count.rows[0]?.n ?? 0, page,
        results: rows.rows.map(h => ({
          id: h.main_id, book: h.book,
          printed_number: h.tarqeem_matboa1?.trim() || null, harf_number: h.tarqeem_harf?.trim() || null,
          tarf: clip(h.tarf, 220), url: `${SITE}/hadith/${h.main_id}`,
        })),
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
