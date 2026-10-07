// A signed-in reader's research library (tables from db/add_library.js): collections of hadiths,
// narrators, saved searches and comparisons; one note and set of tags per item; highlighted passages.
// Shared by the /api/library routes, the /library pages and the MCP tools. Every function takes the
// user id and touches only that user's rows.
import { randomBytes } from 'node:crypto'
import pool from '@/lib/db'

export type ItemKind = 'hadith' | 'narrator' | 'search' | 'compare'
export const ITEM_KINDS: ItemKind[] = ['hadith', 'narrator', 'search', 'compare']
export const isKind = (k: unknown): k is ItemKind => ITEM_KINDS.includes(k as ItemKind)

export const LIMITS = { collections: 200, itemsPerCollection: 5000, note: 20000, tags: 30, tag: 60, title: 160, description: 2000 }

export interface CollectionSummary {
  id: number; title: string; description: string | null; items: number; shared: boolean
  share_token: string | null; updated_at: string
}
export interface HadithInfo {
  main_id: number; book_id: number; book: string; author: string | null; author_death: number | null
  printed_number: string | null; harf_number: string | null; part: number | null; page: number | null
  chapter: string | null; tarf: string | null
}
export interface LibraryItem {
  id: number; kind: ItemKind; ref: string; label: string | null; position: number; added_at: string
  note: string | null; tags: string[]
  hadith?: HadithInfo
  narrator?: { id: number; name: string; title: string | null; death: string | null }
}

const cleanTags = (tags: unknown): string[] =>
  [...new Set((Array.isArray(tags) ? tags : String(tags ?? '').split(/[,،]/))
    .map(t => String(t).trim().slice(0, LIMITS.tag)).filter(Boolean))].slice(0, LIMITS.tags)

// ── collections ────────────────────────────────────────────────────────────────

export async function listCollections(userId: number): Promise<CollectionSummary[]> {
  const r = await pool.query<CollectionSummary>(
    `SELECT c.id, c.title, c.description, c.share_token, c.share_token IS NOT NULL AS shared, c.updated_at,
            (SELECT COUNT(*)::int FROM collection_items i WHERE i.collection_id = c.id) AS items
     FROM collections c WHERE c.user_id = $1 ORDER BY c.updated_at DESC`, [userId])
  return r.rows
}

export async function createCollection(userId: number, title: string, description?: string | null) {
  const t = title.trim().slice(0, LIMITS.title)
  if (!t) throw new LibraryError('اكتب عنوانًا للمجموعة')
  const n = await pool.query<{ n: number }>(`SELECT COUNT(*)::int n FROM collections WHERE user_id = $1`, [userId])
  if (n.rows[0].n >= LIMITS.collections) throw new LibraryError('بلغت الحدّ الأعلى للمجموعات')
  const r = await pool.query<{ id: number }>(
    `INSERT INTO collections (user_id, title, description) VALUES ($1, $2, $3) RETURNING id`,
    [userId, t, description?.trim().slice(0, LIMITS.description) || null])
  return r.rows[0].id
}

export async function updateCollection(userId: number, id: number, patch: { title?: string; description?: string | null }) {
  const c = await ownCollection(userId, id)
  const title = patch.title !== undefined ? patch.title.trim().slice(0, LIMITS.title) : c.title
  if (!title) throw new LibraryError('اكتب عنوانًا للمجموعة')
  const description = patch.description !== undefined ? (patch.description?.trim().slice(0, LIMITS.description) || null) : c.description
  await pool.query(`UPDATE collections SET title = $3, description = $4, updated_at = now() WHERE id = $1 AND user_id = $2`,
    [id, userId, title, description])
}

export async function deleteCollection(userId: number, id: number) {
  await pool.query(`DELETE FROM collections WHERE id = $1 AND user_id = $2`, [id, userId])
}

/** Share a collection read-only (a new link each time it is switched on), or stop sharing it */
export async function setShared(userId: number, id: number, on: boolean): Promise<string | null> {
  await ownCollection(userId, id)
  const token = on ? randomBytes(12).toString('base64url') : null
  await pool.query(`UPDATE collections SET share_token = $3 WHERE id = $1 AND user_id = $2`, [id, userId, token])
  return token
}

async function ownCollection(userId: number, id: number) {
  const r = await pool.query<{ id: number; title: string; description: string | null }>(
    `SELECT id, title, description FROM collections WHERE id = $1 AND user_id = $2`, [id, userId])
  if (!r.rows[0]) throw new LibraryError('لا توجد هذه المجموعة', 404)
  return r.rows[0]
}

// ── items ──────────────────────────────────────────────────────────────────────

export async function addItem(userId: number, collectionId: number, kind: ItemKind, ref: string, label?: string | null) {
  await ownCollection(userId, collectionId)
  const r0 = ref.trim().slice(0, 2000)
  if (!r0) throw new LibraryError('عنصر غير صالح')
  if ((kind === 'hadith' || kind === 'narrator') && !/^\d+$/.test(r0)) throw new LibraryError('رقم غير صالح')
  const n = await pool.query<{ n: number; maxpos: number | null }>(
    `SELECT COUNT(*)::int n, MAX(position) maxpos FROM collection_items WHERE collection_id = $1`, [collectionId])
  if (n.rows[0].n >= LIMITS.itemsPerCollection) throw new LibraryError('المجموعة ممتلئة')
  await pool.query(
    `INSERT INTO collection_items (collection_id, kind, ref, label, position) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (collection_id, kind, ref) DO UPDATE SET label = COALESCE(EXCLUDED.label, collection_items.label)`,
    [collectionId, kind, r0, label?.trim().slice(0, 300) || null, (n.rows[0].maxpos ?? 0) + 1])
  await pool.query(`UPDATE collections SET updated_at = now() WHERE id = $1`, [collectionId])
}

export async function removeItem(userId: number, collectionId: number, kind: ItemKind, ref: string) {
  await ownCollection(userId, collectionId)
  await pool.query(`DELETE FROM collection_items WHERE collection_id = $1 AND kind = $2 AND ref = $3`, [collectionId, kind, ref])
  await pool.query(`UPDATE collections SET updated_at = now() WHERE id = $1`, [collectionId])
}

/** Move an item before/after another (or to the top/bottom): positions are fractional */
export async function moveItem(userId: number, collectionId: number, itemId: number, direction: 'up' | 'down') {
  await ownCollection(userId, collectionId)
  const items = (await pool.query<{ id: number; position: number }>(
    `SELECT id, position FROM collection_items WHERE collection_id = $1 ORDER BY position, id`, [collectionId])).rows
  const i = items.findIndex(x => x.id === itemId)
  const j = direction === 'up' ? i - 1 : i + 1
  if (i < 0 || j < 0 || j >= items.length) return
  // swap the two positions (renumber first if they are equal)
  if (items[i].position === items[j].position) {
    for (let k = 0; k < items.length; k++) items[k].position = k + 1
    for (const it of items) await pool.query(`UPDATE collection_items SET position = $2 WHERE id = $1`, [it.id, it.position])
  }
  await pool.query(`UPDATE collection_items SET position = $2 WHERE id = $1`, [items[i].id, items[j].position])
  await pool.query(`UPDATE collection_items SET position = $2 WHERE id = $1`, [items[j].id, items[i].position])
}

/** A collection with its items, the hadiths and narrators filled in */
export async function getCollection(userId: number | null, id: number, shareToken?: string) {
  const c = (await pool.query<CollectionSummary & { user_id: number; created_at: string }>(
    shareToken
      ? `SELECT id, user_id, title, description, share_token, true AS shared, created_at, updated_at, 0 AS items FROM collections WHERE share_token = $1`
      : `SELECT id, user_id, title, description, share_token, share_token IS NOT NULL AS shared, created_at, updated_at, 0 AS items FROM collections WHERE id = $1 AND user_id = $2`,
    shareToken ? [shareToken] : [id, userId])).rows[0]
  if (!c) return null
  const items = (await pool.query<LibraryItem>(
    `SELECT i.id, i.kind, i.ref, i.label, i.position, i.added_at, n.body AS note, COALESCE(n.tags, '{}') AS tags
     FROM collection_items i
     LEFT JOIN library_notes n ON n.user_id = $2 AND n.kind = i.kind AND n.ref = i.ref
     WHERE i.collection_id = $1 ORDER BY i.position, i.id`, [c.id, c.user_id])).rows
  await hydrate(items)
  return { ...c, items: items.length, list: items }
}

async function hydrate(items: LibraryItem[]) {
  const hadithIds = items.filter(i => i.kind === 'hadith').map(i => Number(i.ref))
  const narratorIds = items.filter(i => i.kind === 'narrator').map(i => Number(i.ref))
  if (hadithIds.length) {
    const byId = new Map((await hadithInfo(hadithIds)).map(h => [h.main_id, h]))
    for (const i of items) if (i.kind === 'hadith') i.hadith = byId.get(Number(i.ref))
  }
  if (narratorIds.length) {
    const r = await pool.query<{ id: number; name: string; title: string | null; death: string | null }>(
      `SELECT id, COALESCE(NULLIF(abb_name, ''), name) AS name, companion_title AS title, NULLIF(trim(death_year), '') AS death
       FROM narrators WHERE id = ANY($1::int[])`, [narratorIds])
    const byId = new Map(r.rows.map(n => [n.id, n]))
    for (const i of items) if (i.kind === 'narrator') i.narrator = byId.get(Number(i.ref))
  }
}

export async function hadithInfo(ids: number[]): Promise<HadithInfo[]> {
  if (!ids.length) return []
  const r = await pool.query<HadithInfo>(
    `SELECT ht.main_id, ht.book_id, b.title AS book, b.takhrij_author AS author, b.takhrij_death AS author_death,
            NULLIF(trim(ht.tarqeem_matboa1), '') AS printed_number, NULLIF(trim(ht.tarqeem_harf), '') AS harf_number,
            ht.part_num AS part, ht.page_num AS page,
            NULLIF(trim(concat_ws(' — ', NULLIF(trim(ht.section_text), ''), NULLIF(trim(ht.chapter_text), ''))), '') AS chapter,
            regexp_replace(coalesce(ht.tarf, ''), '<[^>]+>', ' ', 'g') AS tarf
     FROM hadith_toc ht JOIN books b ON b.id = ht.book_id WHERE ht.main_id = ANY($1::int[])`, [ids])
  return r.rows
}

// ── state of one item: which collections hold it, its note ─────────────────────

export async function itemState(userId: number, kind: ItemKind, ref: string) {
  const [cols, note] = await Promise.all([
    pool.query<{ id: number; title: string; has: boolean }>(
      `SELECT c.id, c.title, EXISTS (SELECT 1 FROM collection_items i WHERE i.collection_id = c.id AND i.kind = $2 AND i.ref = $3) AS has
       FROM collections c WHERE c.user_id = $1 ORDER BY c.updated_at DESC`, [userId, kind, ref]),
    pool.query<{ body: string; tags: string[]; updated_at: string }>(
      `SELECT body, tags, updated_at FROM library_notes WHERE user_id = $1 AND kind = $2 AND ref = $3`, [userId, kind, ref]),
  ])
  return { collections: cols.rows, note: note.rows[0] ?? null }
}

/** For a page of results: in how many of the reader's collections each item is, and whether it has a note */
export async function savedCounts(userId: number, kind: ItemKind, refs: string[]) {
  const list = [...new Set(refs.map(r => r.trim()).filter(Boolean))].slice(0, 200)
  if (!list.length) return {}
  const r = await pool.query<{ ref: string; n: number; noted: boolean }>(
    `SELECT x.ref,
            (SELECT COUNT(*)::int FROM collection_items i JOIN collections c ON c.id = i.collection_id
              WHERE c.user_id = $1 AND i.kind = $2 AND i.ref = x.ref) AS n,
            EXISTS (SELECT 1 FROM library_notes n WHERE n.user_id = $1 AND n.kind = $2 AND n.ref = x.ref) AS noted
     FROM unnest($3::text[]) AS x(ref)`, [userId, kind, list])
  return Object.fromEntries(r.rows.map(x => [x.ref, { n: x.n, noted: x.noted }]))
}

// ── notes ──────────────────────────────────────────────────────────────────────

export async function setNote(userId: number, kind: ItemKind, ref: string, body: string, tags?: unknown) {
  const b = String(body ?? '').slice(0, LIMITS.note)
  const t = tags === undefined ? undefined : cleanTags(tags)
  if (!b.trim() && (!t || !t.length)) {
    // an empty note with no tags: remove it (unless tags were not given — then only clear the body)
    if (t !== undefined) return void await pool.query(`DELETE FROM library_notes WHERE user_id = $1 AND kind = $2 AND ref = $3`, [userId, kind, ref])
  }
  await pool.query(
    `INSERT INTO library_notes (user_id, kind, ref, body, tags) VALUES ($1, $2, $3, $4, COALESCE($5::text[], '{}'))
     ON CONFLICT (user_id, kind, ref) DO UPDATE SET body = EXCLUDED.body,
       tags = COALESCE($5::text[], library_notes.tags), updated_at = now()`,
    [userId, kind, ref, b, t ?? null])
}

/** Notes, newest first; with a query, those whose text or tags contain it */
export async function listNotes(userId: number, query?: string, limit = 100) {
  const q = query?.trim()
  const r = await pool.query<{ kind: ItemKind; ref: string; body: string; tags: string[]; updated_at: string }>(
    `SELECT kind, ref, body, tags, updated_at FROM library_notes WHERE user_id = $1
       AND ($2::text IS NULL OR body ILIKE '%' || $2 || '%' OR EXISTS (SELECT 1 FROM unnest(tags) t WHERE t ILIKE '%' || $2 || '%'))
     ORDER BY updated_at DESC LIMIT $3`, [userId, q || null, Math.min(500, limit)])
  const items = r.rows.map((n, i) => ({ id: -i - 1, kind: n.kind, ref: n.ref, label: null, position: 0, added_at: n.updated_at, note: n.body, tags: n.tags })) as LibraryItem[]
  await hydrate(items)
  return items
}

export async function allTags(userId: number) {
  const r = await pool.query<{ tag: string; n: number }>(
    `SELECT t AS tag, COUNT(*)::int n FROM library_notes, unnest(tags) t WHERE user_id = $1 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 200`, [userId])
  return r.rows
}

// ── highlights ─────────────────────────────────────────────────────────────────

export interface Highlight { id: number; hadith_id: number; part: 'sanad' | 'matn'; start_at: number; end_at: number; quote: string; note: string | null; color: string; created_at: string }

export async function listHighlights(userId: number, hadithId?: number) {
  const r = await pool.query<Highlight>(
    `SELECT id, hadith_id, part, start_at, end_at, quote, note, color, created_at FROM highlights
     WHERE user_id = $1 AND ($2::int IS NULL OR hadith_id = $2) ORDER BY hadith_id, part, start_at LIMIT 2000`, [userId, hadithId ?? null])
  return r.rows
}

export async function addHighlight(userId: number, h: { hadith_id: number; part: string; start_at: number; end_at: number; quote: string; note?: string | null; color?: string }) {
  if (h.part !== 'sanad' && h.part !== 'matn') throw new LibraryError('جزء غير صالح')
  const quote = String(h.quote ?? '').trim().slice(0, 4000)
  if (!quote || !(h.end_at > h.start_at)) throw new LibraryError('حدّد نصًّا أولًا')
  const color = ['gold', 'green', 'red', 'blue'].includes(String(h.color)) ? String(h.color) : 'gold'
  const r = await pool.query<{ id: number }>(
    `INSERT INTO highlights (user_id, hadith_id, part, start_at, end_at, quote, note, color) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [userId, h.hadith_id, h.part, Math.max(0, Math.trunc(h.start_at)), Math.trunc(h.end_at), quote, h.note?.slice(0, LIMITS.note) || null, color])
  return r.rows[0].id
}

export async function updateHighlight(userId: number, id: number, note: string | null) {
  await pool.query(`UPDATE highlights SET note = $3 WHERE id = $1 AND user_id = $2`, [id, userId, note?.slice(0, LIMITS.note) || null])
}

export async function deleteHighlight(userId: number, id: number) {
  await pool.query(`DELETE FROM highlights WHERE id = $1 AND user_id = $2`, [id, userId])
}

// ── import from the browser (what was saved before signing in) ─────────────────

/** Merges the localStorage library (saved ids, notes, tags) into the account; nothing is overwritten */
export async function importLocal(userId: number, data: { saved?: unknown; notes?: unknown; tags?: unknown }) {
  const saved = (Array.isArray(data.saved) ? data.saved : []).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, LIMITS.itemsPerCollection)
  const notes = (data.notes && typeof data.notes === 'object' ? data.notes : {}) as Record<string, unknown>
  const tags = (data.tags && typeof data.tags === 'object' ? data.tags : {}) as Record<string, unknown>
  let added = 0, notesAdded = 0
  if (saved.length) {
    const existing = (await pool.query<{ id: number }>(
      `SELECT id FROM collections WHERE user_id = $1 AND title = 'المحفوظات' ORDER BY id LIMIT 1`, [userId])).rows[0]
    const cid = existing?.id ?? await createCollection(userId, 'المحفوظات', 'ما حُفظ في هذا المتصفح قبل تسجيل الدخول')
    for (const id of saved) { await addItem(userId, cid, 'hadith', String(id)); added++ }
  }
  const keys = new Set([...Object.keys(notes), ...Object.keys(tags)].filter(k => /^\d+$/.test(k)))
  for (const k of keys) {
    const body = String(notes[k] ?? '').slice(0, LIMITS.note)
    const t = cleanTags(tags[k] ?? [])
    const r = await pool.query(
      `INSERT INTO library_notes (user_id, kind, ref, body, tags) VALUES ($1, 'hadith', $2, $3, $4)
       ON CONFLICT (user_id, kind, ref) DO NOTHING`, [userId, k, body, t])
    notesAdded += r.rowCount ?? 0
  }
  return { added, notesAdded }
}

export class LibraryError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
