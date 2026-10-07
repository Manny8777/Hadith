// MCP tools on the reader's own research library (lib/library.ts): only with an account (a personal
// hd_ token or the OAuth sign-in of /mcp/account). The write tools are marked as such, so assistants
// ask before changing anything.
import type { User } from '@/lib/auth'
import {
  addItem, createCollection, getCollection, listCollections, listNotes, removeItem, setNote, LibraryError,
} from '@/lib/library'
import { citeItems, FORMATS, isFormat } from '@/lib/citation'
import type { Tool } from './tools'

const SITE = 'https://hadith.dev'
const need = (user: User | null): User => {
  if (!user) throw new Error('This needs an account: create one free at https://hadith.dev/login, then connect https://hadith.dev/mcp/account (or use a personal token from https://hadith.dev/account). / تحتاج هذه الأداة حسابًا.')
  return user
}
const int = (v: unknown, name: string) => {
  const n = Math.trunc(Number(v))
  if (!Number.isFinite(n) || n <= 0) throw new LibraryError(`${name} must be a positive integer`)
  return n
}
const kindOf = (v: unknown): 'hadith' | 'narrator' => (v === 'narrator' ? 'narrator' : 'hadith')

/** A collection by id, or by its exact title (created when create_if_missing) */
async function resolveCollection(userId: number, a: Record<string, unknown>) {
  if (a.collection_id) return int(a.collection_id, 'collection_id')
  const title = String(a.collection_title ?? '').trim()
  if (!title) throw new LibraryError('Give collection_id or collection_title')
  const found = (await listCollections(userId)).find(c => c.title.trim() === title)
  if (found) return found.id
  if (a.create_if_missing === false) throw new LibraryError(`No collection titled «${title}»`)
  return createCollection(userId, title)
}

export const LIBRARY_TOOLS: Tool[] = [
  {
    name: 'list_my_collections',
    title: 'مجموعاتي',
    description: "The signed-in reader's research collections on hadith.dev: id, title, description, number of items, last change. Needs an account.",
    inputSchema: { type: 'object', properties: {} },
    readOnly: true,
    async run(_a, { user }) {
      const cols = await listCollections(need(user).id)
      return cols.map(c => ({ id: c.id, title: c.title, description: c.description, items: c.items, updated_at: c.updated_at, url: `${SITE}/library/${c.id}` }))
    },
  },
  {
    name: 'get_my_collection',
    title: 'محتوى مجموعة',
    description: "One of the reader's collections with its items in order: hadiths (book, printed and Harf numbers, volume/page, opening words, link), narrators, saved searches — each with the reader's own note and tags. Needs an account.",
    inputSchema: { type: 'object', properties: { collection_id: { type: 'integer' } }, required: ['collection_id'] },
    readOnly: true,
    async run(a, { user }) {
      const c = await getCollection(need(user).id, int(a.collection_id, 'collection_id'))
      if (!c) throw new LibraryError('No such collection')
      return {
        id: c.id, title: c.title, description: c.description, url: `${SITE}/library/${c.id}`,
        items: c.list.slice(0, 300).map(i => ({
          kind: i.kind, ref: i.ref,
          ...(i.hadith ? { hadith_id: i.hadith.main_id, book: i.hadith.book, printed_number: i.hadith.printed_number, harf_number: i.hadith.harf_number, volume: i.hadith.part, page: i.hadith.page, opening: i.hadith.tarf?.trim().slice(0, 200), url: `${SITE}/hadith/${i.hadith.main_id}` } : {}),
          ...(i.narrator ? { narrator_id: i.narrator.id, name: i.narrator.name, url: `${SITE}/narrator/${i.narrator.id}` } : {}),
          ...(i.kind === 'search' ? { search_url: `${SITE}/search?${i.ref}` } : {}),
          note: i.note || undefined, tags: i.tags.length ? i.tags : undefined,
        })),
      }
    },
  },
  {
    name: 'save_to_my_collection',
    title: 'حفظ في مجموعة',
    description: "Save a hadith (by its hadith.dev id) or a narrator (by narrator id) into one of the reader's collections — by collection_id, or by collection_title (created if it does not exist). Optionally write the reader's note and tags on it at the same time. Only do this when the reader asks. Needs an account.",
    readOnly: false,
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['hadith', 'narrator'], description: 'Default hadith.' },
        id: { type: 'integer', description: 'The hadith id (from search_hadith / get_hadith) or narrator id.' },
        collection_id: { type: 'integer' },
        collection_title: { type: 'string', description: 'Used when collection_id is not given; the collection is created if missing.' },
        note: { type: 'string', description: "The reader's note on this item (replaces any earlier note). Only what the reader asked to write." },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
    async run(a, { user }) {
      const u = need(user)
      const kind = kindOf(a.kind), ref = String(int(a.id, 'id'))
      const cid = await resolveCollection(u.id, a)
      await addItem(u.id, cid, kind, ref)
      if (a.note !== undefined || a.tags !== undefined) await setNote(u.id, kind, ref, String(a.note ?? ''), a.tags)
      return { saved: true, collection_id: cid, url: `${SITE}/library/${cid}` }
    },
  },
  {
    name: 'remove_from_my_collection',
    title: 'إزالة من مجموعة',
    description: "Remove a hadith or narrator from one of the reader's collections (its note stays). Only when the reader asks. Needs an account.",
    inputSchema: {
      type: 'object',
      properties: { collection_id: { type: 'integer' }, kind: { type: 'string', enum: ['hadith', 'narrator'] }, id: { type: 'integer' } },
      required: ['collection_id', 'id'],
    },
    readOnly: false,
    async run(a, { user }) {
      await removeItem(need(user).id, int(a.collection_id, 'collection_id'), kindOf(a.kind), String(int(a.id, 'id')))
      return { removed: true }
    },
  },
  {
    name: 'create_my_collection',
    title: 'مجموعة جديدة',
    description: "Create a research collection for the reader (title, optional description). Only when the reader asks. Needs an account.",
    inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } }, required: ['title'] },
    readOnly: false,
    async run(a, { user }) {
      const id = await createCollection(need(user).id, String(a.title ?? ''), a.description == null ? null : String(a.description))
      return { id, url: `${SITE}/library/${id}` }
    },
  },
  {
    name: 'write_my_note',
    title: 'ملاحظة بحثية',
    description: "Write (or replace) the reader's private research note and tags on a hadith or narrator. Empty note and no tags removes it. Only write what the reader asked for. Needs an account.",
    inputSchema: {
      type: 'object',
      properties: { kind: { type: 'string', enum: ['hadith', 'narrator'] }, id: { type: 'integer' }, note: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } },
      required: ['id', 'note'],
    },
    readOnly: false,
    async run(a, { user }) {
      await setNote(need(user).id, kindOf(a.kind), String(int(a.id, 'id')), String(a.note ?? ''), a.tags)
      return { saved: true }
    },
  },
  {
    name: 'search_my_notes',
    title: 'البحث في ملاحظاتي',
    description: "The reader's notes (newest first), or those whose text or tags contain the query, each with the hadith or narrator it is on. Needs an account.",
    inputSchema: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 100 } } },
    readOnly: true,
    async run(a, { user }) {
      const notes = await listNotes(need(user).id, a.query ? String(a.query) : undefined, Math.min(100, Math.max(1, Number(a.limit) || 30)))
      return notes.map(n => ({
        kind: n.kind, id: Number(n.ref), note: n.note, tags: n.tags, updated_at: n.added_at,
        ...(n.hadith ? { book: n.hadith.book, printed_number: n.hadith.printed_number, opening: n.hadith.tarf?.trim().slice(0, 160), url: `${SITE}/hadith/${n.ref}` } : {}),
        ...(n.narrator ? { name: n.narrator.name, url: `${SITE}/narrator/${n.ref}` } : {}),
      }))
    },
  },
  {
    name: 'cite_hadiths',
    title: 'توثيق الأحاديث',
    description: 'Citations of hadiths (by hadith.dev id) for reference managers or a paper: format bib (BibTeX/BibLaTeX), ris (EndNote/Mendeley/Zotero), json (CSL-JSON), or txt (Arabic footnotes: «أخرجه البخاري في صحيح البخاري (دار طوق النجاة…)، 4/139، رقم (3350).»). Give ids, or a collection_id of the reader\'s (needs an account) to cite the whole collection with their notes. Works without an account for ids.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'integer' }, description: 'Hadith ids.' },
        collection_id: { type: 'integer', description: "Cite one of the reader's collections instead." },
        format: { type: 'string', enum: ['bib', 'ris', 'json', 'txt'], description: 'Default txt (Arabic footnotes).' },
      },
    },
    readOnly: true,
    async run(a, { user }) {
      const format = isFormat(a.format) ? a.format : 'txt'
      let ids: number[] = (Array.isArray(a.ids) ? a.ids : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 200)
      let extra = new Map<number, { note: string | null; tags: string[] }>()
      if (a.collection_id) {
        const c = await getCollection(need(user).id, int(a.collection_id, 'collection_id'))
        if (!c) throw new LibraryError('No such collection')
        const hs = c.list.filter(i => i.kind === 'hadith')
        ids = hs.map(i => Number(i.ref))
        extra = new Map(hs.map(i => [Number(i.ref), { note: i.note, tags: i.tags }]))
      }
      if (!ids.length) throw new LibraryError('Give ids or collection_id')
      const items = await citeItems(ids)
      for (const it of items) { const e = extra.get(it.id); if (e) { it.note = e.note; it.tags = e.tags } }
      return { format, text: String(FORMATS[format].render(items)) }
    },
  },
]
