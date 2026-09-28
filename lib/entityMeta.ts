import type { Metadata } from 'next'
import { cache } from 'react'
import pool from '@/lib/db'
import { pageMeta, clip } from '@/lib/siteMeta'

// Page metadata (title, description, link preview) for the pages about one narrator, book or hadith.
// `section` names the sub-page («شيوخه», «تحليل الكتاب»…) and is prefixed to the title.

const withSection = (name: string, section?: string) => (section ? `${section}: ${name}` : name)

const getNarrator = cache(async (id: number) => (await pool.query<{
  name: string; abb_name: string | null; kunia: string | null; death_year: string | null
  tabaqa: string | null; martaba_ibn_hajar: string | null; martaba_zahabi: string | null; is_companion: boolean | null
}>(
  `SELECT name, abb_name, kunia, death_year, tabaqa, martaba_ibn_hajar, martaba_zahabi, is_companion
   FROM narrators WHERE id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

export async function narratorMeta(idParam: string, path: string, section?: string): Promise<Metadata> {
  const id = parseInt(idParam)
  const n = Number.isNaN(id) ? undefined : await getNarrator(id)
  if (!n) return {}
  const name = (n.abb_name || n.name).trim()
  const facts = [
    n.is_companion ? 'صحابي' : null,
    n.kunia?.trim(),
    n.tabaqa?.trim() && !n.is_companion ? `الطبقة: ${n.tabaqa.trim()}` : null,
    n.death_year?.trim() ? `الوفاة: ${n.death_year.trim()}` : null,
    n.martaba_ibn_hajar?.trim() ? `ابن حجر: ${n.martaba_ibn_hajar.trim()}` : null,
    n.martaba_zahabi?.trim() ? `الذهبي: ${n.martaba_zahabi.trim()}` : null,
  ].filter(Boolean)
  // Grades first: the full lineage can be long enough to push them out of a preview
  const full = name === n.name.trim() ? '' : ` — ${n.name.trim()}`
  return pageMeta({ title: withSection(name, section), description: clip(facts.join(' · ') + full, 240), path, type: 'profile' })
}

const getBook = cache(async (id: number) => (await pool.query<{
  title: string; takhrij_author: string | null; takhrij_death: number | null; print1_edition: string | null
}>(
  `SELECT title, takhrij_author, takhrij_death, print1_edition FROM books WHERE id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

export async function bookMeta(idParam: string, path: string, section?: string): Promise<Metadata> {
  const id = parseInt(idParam)
  const b = Number.isNaN(id) ? undefined : await getBook(id)
  if (!b) return {}
  const facts = [
    b.takhrij_author?.trim() ? `${b.takhrij_author.trim()}${b.takhrij_death ? ` (ت ${b.takhrij_death} هـ)` : ''}` : null,
    b.print1_edition?.trim() ? `الطبعة: ${b.print1_edition.trim()}` : null,
  ].filter(Boolean)
  return pageMeta({ title: withSection(b.title.trim(), section), description: facts.join(' · ') || null, path })
}

const getHadith = cache(async (id: number) => (await pool.query<{
  book_title: string; tarf: string | null; tarqeem_matboa1: string | null; tarqeem_harf: string | null
}>(
  `SELECT b.title AS book_title, h.tarf, h.tarqeem_matboa1, h.tarqeem_harf
   FROM hadith_toc h JOIN books b ON b.id = h.book_id WHERE h.main_id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// The hadith's sub-pages (its witnesses, pivot, chains…): «section: book number» + the hadith's opening
export async function hadithSectionMeta(idParam: string, path: string, section: string): Promise<Metadata> {
  const id = parseInt(idParam)
  const h = Number.isNaN(id) ? undefined : await getHadith(id)
  if (!h) return {}
  const num = h.tarqeem_matboa1?.trim() || h.tarqeem_harf?.trim()
  const source = num ? `${h.book_title} ${num}` : h.book_title
  return pageMeta({ title: `${section}: ${source}`, description: clip(h.tarf, 220) || null, path, type: 'article' })
}

const fmt = (n: number | string | null | undefined) => Number(n || 0).toLocaleString('ar-EG')
const toId = (idParam: string) => { const id = parseInt(idParam); return Number.isNaN(id) ? undefined : id }

const getAuthor = cache(async (id: number) => (await pool.query<{
  name: string; short_name: string | null; death_date: number | null; info: string | null; book_titles: string[] | null
}>(
  `SELECT a.name, a.short_name, a.death_date, a.info,
          ARRAY(SELECT b.title FROM books b WHERE b.author_id = a.id ORDER BY b.id) AS book_titles
   FROM authors a WHERE a.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// An author: name, death year and his books in the encyclopedia
export async function authorMeta(idParam: string, path: string): Promise<Metadata> {
  const id = toId(idParam)
  const a = id === undefined ? undefined : await getAuthor(id)
  if (!a) return {}
  const books = (a.book_titles || []).map(t => t.trim()).filter(Boolean)
  const facts = [
    a.death_date && a.death_date > 0 ? `توفي سنة ${a.death_date} هـ` : null,
    books.length ? `كتبه في الموسوعة: ${books.length <= 4 ? books.join('، ') : `${books.slice(0, 3).join('، ')} و${fmt(books.length - 3)} غيرها`}` : null,
  ].filter(Boolean)
  return pageMeta({ title: clip(a.name, 90), description: clip(facts.join(' · ') || a.info, 220) || null, path, type: 'profile' })
}

const getCompanion = cache(async (id: number) => (await pool.query<{
  name: string; abb_name: string | null; death_year: string | null; hadiths_count: number | null
}>(
  `SELECT name, abb_name, death_year_num AS death_year, hadiths_count FROM narrators WHERE id = $1 AND is_companion = true`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// A companion's musnad: «مسند name»
export async function companionMusnadMeta(idParam: string, path: string): Promise<Metadata> {
  const id = toId(idParam)
  const c = id === undefined ? undefined : await getCompanion(id)
  if (!c) return {}
  const facts = [
    'مسند الصحابي: أحاديثه مرتبة على الكتب والأبواب',
    c.death_year ? `ت ${c.death_year} هـ` : null,
    c.hadiths_count ? `${fmt(c.hadiths_count)} حديث` : null,
  ].filter(Boolean)
  return pageMeta({ title: `مسند ${clip(c.abb_name || c.name, 80)}`, description: facts.join(' · '), path, type: 'profile' })
}

// Tree nodes (controversial issues, hadith terms, lexicon): the node's text, its parent, and its children count
type TreeTable = 'hadith_controversial_tree' | 'hadith_expressions_tree' | 'lexicon_items'
const getTreeNode = cache(async (table: TreeTable, id: number) => (await pool.query<{
  text: string; parent_text: string | null; child_count: number
}>(
  `SELECT t.text, p.text AS parent_text,
          (SELECT COUNT(*)::int FROM ${table} c WHERE c.parent_id = t.id) AS child_count
   FROM ${table} t LEFT JOIN ${table} p ON p.id = t.parent_id
   WHERE t.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

async function treeMeta(table: TreeTable, idParam: string, path: string, label: string, childWord: string): Promise<Metadata> {
  const id = toId(idParam)
  const n = id === undefined ? undefined : await getTreeNode(table, id)
  if (!n) return {}
  const facts = [
    label,
    n.parent_text?.trim(),
    n.child_count ? `${fmt(n.child_count)} ${childWord}` : null,
  ].filter(Boolean)
  return pageMeta({ title: clip(n.text, 110), description: clip(facts.join(' · '), 220), path, type: 'article' })
}

export const controversialMeta = (id: string, path: string) =>
  treeMeta('hadith_controversial_tree', id, path, 'مختلف الحديث', 'موضوع فرعي')
export const hadithTermMeta = (id: string, path: string) =>
  treeMeta('hadith_expressions_tree', id, path, 'تطبيقات المصطلح', 'مصطلح فرعي')
export const lexiconMeta = (id: string, path: string) =>
  treeMeta('lexicon_items', id, path, 'المعجم', 'مادة فرعية')

const getIlalCompanion = cache(async (slug: string) => (await pool.query<{ name: string; tarjama: string | null; entries: number }>(
  `SELECT c.name, c.tarjama, (SELECT COUNT(*)::int FROM ilal_entries e WHERE e.companion_id = c.id) AS entries
   FROM ilal_companions c WHERE c.slug = $1`, [slug]
).catch(() => ({ rows: [] }))).rows[0])

// A companion in «المسند المصنف المعلل»
export async function musnadMusannafMeta(slug: string, path: string): Promise<Metadata> {
  const c = await getIlalCompanion(slug)
  if (!c) return {}
  const facts = [`${fmt(c.entries)} أحاديث مسندة في المسند المصنف المعلل`, clip(c.tarjama?.replace(/\(¬?[\d٠-٩]+\)/g, ''), 160)].filter(Boolean)
  return pageMeta({ title: `${c.name.trim()} ﵁`, description: clip(facts.join(' · '), 220), path, type: 'profile' })
}

const getSura = cache(async (id: number) => (await pool.query<{ name: string; ayat: number; tafseer: number }>(
  `SELECT s.name,
          (SELECT COUNT(*)::int FROM quran_ayat a WHERE a.sora_id = s.id) AS ayat,
          (SELECT COUNT(*)::int FROM quran_ayat a WHERE a.sora_id = s.id AND (a.has_tafsser
             OR EXISTS (SELECT 1 FROM quran_ayat_services q WHERE q.sura = s.id AND q.aya = a.aya_num))) AS tafseer
   FROM quran_suras s WHERE s.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

export async function suraMeta(idParam: string, path: string): Promise<Metadata> {
  const id = toId(idParam)
  const s = id === undefined ? undefined : await getSura(id)
  if (!s) return {}
  const desc = `${fmt(s.ayat)} آية · ${fmt(s.tafseer)} آية لها تفسير — الآيات وما ورد في تفسيرها من كتب الحديث`
  return pageMeta({ title: `سورة ${s.name.trim()}`, description: desc, path })
}

const getScholar = cache(async (id: number) => (await pool.query<{
  name: string; abb_name: string | null; death_year: string | null; tabaqa: string | null; judgments: number
}>(
  `SELECT name, abb_name, death_year, tabaqa,
          (SELECT COUNT(*)::int FROM hadith_judgments WHERE scientist_id = n.id) AS judgments
   FROM narrators n WHERE id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// A scholar (critic) and his rulings on hadiths
export async function scholarMeta(idParam: string, path: string, section?: string): Promise<Metadata> {
  const id = toId(idParam)
  const s = id === undefined ? undefined : await getScholar(id)
  if (!s) return {}
  const name = (section ? s.abb_name || s.name : s.name).trim()
  const facts = [
    !section && s.abb_name?.trim() && s.abb_name.trim() !== name ? s.abb_name.trim() : null,
    s.death_year?.trim() ? `الوفاة: ${s.death_year.trim()}` : null,
    s.tabaqa?.trim() ? `الطبقة: ${s.tabaqa.trim()}` : null,
    s.judgments ? `${fmt(s.judgments)} حكمًا على الأحاديث` : null,
  ].filter(Boolean)
  return pageMeta({ title: withSection(clip(name, 90), section), description: facts.join(' · ') || null, path, type: 'profile' })
}

const getServiceNode = cache(async (id: number) => (await pool.query<{
  book_name: string | null; section_text: string | null; part_text: string | null; tarf: string | null
  content: string | null; title: string | null; takhrij_author: string | null; takhrij_death: number | null
}>(
  `SELECT s.book_name, s.section_text, s.part_text, s.tarf, LEFT(s.content, 1500) AS content,
          b.title, b.takhrij_author, b.takhrij_death
   FROM hadith_service_content s LEFT JOIN books b ON b.id = s.book_id WHERE s.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// A passage of a service book (commentary, tafsir…): its heading, the book and author, and the start of the text
export async function serviceContentMeta(idParam: string, path: string): Promise<Metadata> {
  const id = toId(idParam)
  const n = id === undefined ? undefined : await getServiceNode(id)
  if (!n) return {}
  const book = (n.title || n.book_name || '').trim()
  const heading = clip(n.section_text || n.part_text, 110) || book
  const author = n.takhrij_author?.trim() ? `${n.takhrij_author.trim()}${n.takhrij_death ? ` (ت ${n.takhrij_death} هـ)` : ''}` : null
  const source = [heading !== book ? book : null, author].filter(Boolean).join(' — ')
  const text = clip(n.content || n.tarf, 170)
  return pageMeta({ title: heading, description: clip([source, text].filter(Boolean).join(': '), 240) || null, path, type: 'article' })
}

const getTopic = cache(async (id: number) => (await pool.query<{ title: string; parent_title: string | null; items: number }>(
  `SELECT c.title, p.title AS parent_title, (SELECT COUNT(*)::int FROM subject_items WHERE parent_id = c.id) AS items
   FROM subject_categories c LEFT JOIN subject_categories p ON p.id = c.parent_id WHERE c.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

// A topic category (/topics/[id]) or its analysis page
export async function topicMeta(idParam: string, path: string, section?: string): Promise<Metadata> {
  const id = toId(idParam)
  const t = id === undefined ? undefined : await getTopic(id)
  if (!t) return {}
  const facts = section
    ? ['دراسة إحصائية للأحاديث الواردة في هذا الموضوع من حيث الدرجات والأسانيد والمصادر']
    : ['الموضوعات', t.parent_title?.trim(), t.items ? `${fmt(t.items)} موضوع` : null]
  return pageMeta({ title: withSection(t.title.trim(), section), description: facts.filter(Boolean).join(' · '), path })
}

const getTopicItem = cache(async (id: number) => (await pool.query<{
  title: string; parent_title: string | null; hadiths: number; children: number
}>(
  `SELECT si.title, c.title AS parent_title,
          (SELECT COUNT(DISTINCT paragraph_main_id)::int FROM hadith_subjects WHERE subject_id = si.id) AS hadiths,
          (SELECT COUNT(*)::int FROM subject_items WHERE parent_id = si.id) AS children
   FROM subject_items si LEFT JOIN subject_categories c ON c.id = si.parent_id WHERE si.id = $1`, [id]
).catch(() => ({ rows: [] }))).rows[0])

export async function topicItemMeta(idParam: string, path: string): Promise<Metadata> {
  const id = toId(idParam)
  const t = id === undefined ? undefined : await getTopicItem(id)
  if (!t) return {}
  const facts = [
    t.parent_title?.trim(),
    t.hadiths ? `${fmt(t.hadiths)} حديث مرتبط مباشرة` : null,
    t.children ? `${fmt(t.children)} موضوع فرعي` : null,
  ].filter(Boolean)
  return pageMeta({ title: clip(t.title, 110), description: facts.join(' · ') || null, path, type: 'article' })
}
