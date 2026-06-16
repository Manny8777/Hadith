import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'
import {
  buildGhareebSource,
  buildGhareebSourceFromRef,
  buildGhareebWord,
  dedupeGhareebWords,
  parseGhareebTags,
  type GhareebSource,
  type GhareebWord,
} from '@/lib/ghareeb'

export const dynamic = 'force-dynamic'

interface LexiconRow {
  form_id: number
  form_text: string
  word_id: number
  word_text: string
}

interface ContentRow {
  part_text: string | null
  tarf: string | null
  content: string | null
  source_book: string | null
  source_ref_id: number | null
}

function dedupeSources(sources: GhareebSource[]): GhareebSource[] {
  const seen = new Set<string>()
  const out: GhareebSource[] = []
  for (const s of sources) {
    if (!s.definition && !s.verbatimText && !s.sourceBook) continue
    const key = String(s.sourceRefId ?? `${s.sourceBook ?? ''}|${(s.verbatimText ?? s.definition ?? '').slice(0, 80)}`)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

async function resolveLexiconForm(word: string): Promise<LexiconRow | null> {
  const res = await pool.query<LexiconRow>(
    `SELECT li.id AS form_id,
            li.text AS form_text,
            word.id AS word_id,
            word.text AS word_text
     FROM lexicon_items li
     JOIN lexicon_items word ON word.id = li.parent_id
     WHERE li.lexicon_id = 1
       AND li.is_leaf = true
       AND normalize_hadith(li.text) = normalize_hadith($1)
     ORDER BY
       (SELECT COUNT(*)::int
        FROM lexicon_hadith lh
        WHERE lh.lexicon_item_id IN (li.id, word.id)) DESC,
       CASE
         WHEN li.text LIKE 'ال%' AND normalize_hadith($1) LIKE '%' || normalize_hadith('ال') || '%' THEN 0
         WHEN li.text NOT LIKE 'أل%' AND li.text NOT LIKE 'ال%' THEN 1
         ELSE 2
       END,
       length(li.text) ASC
     LIMIT 1`,
    [word]
  )
  return res.rows[0] ?? null
}

async function fetchSourcesByGhareebRef(refId: number): Promise<GhareebSource[]> {
  const res = await pool.query<ContentRow>(
    `SELECT
       part_text,
       tarf,
       content,
       book_name AS source_book,
       id::bigint AS source_ref_id
     FROM hadith_service_content
     WHERE content LIKE '%ربط="' || $1::text || '"%'
     ORDER BY
       CASE WHEN book_name ILIKE '%نهاية%' THEN 0
            WHEN book_name ILIKE '%غريب%' THEN 1
            ELSE 2 END,
       id
     LIMIT 5`,
    [refId]
  )

  const sources: GhareebSource[] = []
  for (const row of res.rows) {
    const src = buildGhareebSourceFromRef(row, refId)
    if (src) sources.push(src)
  }
  return sources
}

async function fetchDefinitions(
  formId: number,
  wordId: number,
  wordInMatn: string,
  tagRefId: number | null
): Promise<GhareebSource[]> {
  const sources: GhareebSource[] = []

  if (tagRefId) {
    const fromRef = await fetchSourcesByGhareebRef(tagRefId)
    if (fromRef.length > 0) return dedupeSources(fromRef)
  }

  const fromLinks = await pool.query<ContentRow>(
    `SELECT
       hsc.part_text,
       hsc.tarf,
       hsc.content,
       hsc.book_name AS source_book,
       hsc.id::bigint AS source_ref_id
     FROM lexicon_hadith lh
     JOIN hadith_service_content hsc ON hsc.id = lh.hadith_id
     WHERE lh.lexicon_item_id IN ($1, $2)
       AND COALESCE(hsc.part_text, hsc.tarf, hsc.content, '') <> ''
     ORDER BY
       CASE WHEN hsc.book_name ILIKE '%نهاية%' THEN 0
            WHEN hsc.book_name ILIKE '%غريب%' THEN 1
            ELSE 2 END,
       hsc.id`,
    [formId, wordId]
  )
  for (const row of fromLinks.rows) {
    const src = buildGhareebSource(row)
    if (src) sources.push(src)
  }

  if (sources.length === 0) {
    const fromNihaya = await pool.query<ContentRow>(
      `SELECT
         hsc.part_text,
         hsc.tarf,
         hsc.content,
         hsc.book_name AS source_book,
         hsc.id::bigint AS source_ref_id
       FROM hadith_service_content hsc
       WHERE hsc.book_name ILIKE '%نهاية%'
         AND (
           normalize_hadith(COALESCE(hsc.tarf, hsc.part_text, hsc.content, ''))
             LIKE '%' || normalize_hadith($1) || '%'
         )
       ORDER BY
         CASE WHEN normalize_hadith(COALESCE(hsc.tarf, '')) LIKE '%' || normalize_hadith($1) || '%' THEN 0 ELSE 1 END,
         length(COALESCE(hsc.tarf, hsc.part_text, hsc.content, '')) DESC NULLS LAST,
         hsc.id
       LIMIT 8`,
      [wordInMatn]
    )
    for (const row of fromNihaya.rows) {
      const src = buildGhareebSource(row)
      if (src) sources.push(src)
    }
  }

  return dedupeSources(sources)
}

async function wordsFromGhareebTags(content: string): Promise<GhareebWord[]> {
  const tags = parseGhareebTags(content)
  const words: GhareebWord[] = []

  for (const tag of tags) {
    const row = await resolveLexiconForm(tag.word)
    if (!row) continue

    const sources = await fetchDefinitions(
      row.form_id,
      row.word_id,
      tag.word,
      tag.refId
    )
    words.push(
      buildGhareebWord(
        {
          formId: row.form_id,
          formText: tag.word,
          wordId: row.word_id,
          wordText: row.form_text,
        },
        sources
      )
    )
  }

  return words
}

async function wordsFromLexiconLinks(hadithId: number): Promise<GhareebWord[]> {
  const res = await pool.query<{
    form_id: number
    form_text: string
    word_id: number
    word_text: string
    part_text: string | null
    tarf: string | null
    content: string | null
    source_book: string | null
    source_ref_id: number | null
  }>(
    `WITH linked AS (
       SELECT lh.lexicon_item_id, lh.hadith_id AS ref_id
       FROM lexicon_hadith lh
       WHERE lh.hadith_id = $1

       UNION

       SELECT lh.lexicon_item_id, lh.hadith_id AS ref_id
       FROM lexicon_hadith lh
       WHERE lh.hadith_id IN (
         SELECT hsl.service_content_id
         FROM hadith_service_links hsl
         WHERE hsl.hadith_id = $1
       )
     )
     SELECT
       li.id AS form_id,
       li.text AS form_text,
       COALESCE(word.id, li.id) AS word_id,
       COALESCE(word.text, li.text) AS word_text,
       hsc.part_text,
       hsc.tarf,
       hsc.content,
       hsc.book_name AS source_book,
       CASE WHEN hsc.id IS NOT NULL THEN hsc.id::bigint ELSE NULL END AS source_ref_id
     FROM linked
     JOIN lexicon_items li ON li.id = linked.lexicon_item_id
     LEFT JOIN lexicon_items word ON word.id = li.parent_id AND li.is_leaf = true
     LEFT JOIN hadith_service_content hsc ON hsc.id = linked.ref_id
     WHERE li.lexicon_id = 1
     ORDER BY li.id, hsc.book_name NULLS LAST, hsc.id`,
    [hadithId]
  )

  const byForm = new Map<number, { row: LexiconRow; sources: GhareebSource[] }>()
  for (const r of res.rows) {
    let entry = byForm.get(r.form_id)
    if (!entry) {
      entry = {
        row: {
          form_id: r.form_id,
          form_text: r.form_text,
          word_id: r.word_id,
          word_text: r.word_text,
        },
        sources: [],
      }
      byForm.set(r.form_id, entry)
    }
    if (r.source_book || r.content || r.tarf || r.part_text) {
      const src = buildGhareebSource(r)
      if (src) entry.sources.push(src)
    }
  }

  return [...byForm.values()].map(({ row, sources }) =>
    buildGhareebWord(
      {
        formId: row.form_id,
        formText: row.form_text,
        wordId: row.word_id,
        wordText: row.word_text,
      },
      dedupeSources(sources)
    )
  )
}

async function wordsFromMatnScan(matnCompare: string): Promise<GhareebWord[]> {
  const res = await pool.query<LexiconRow>(
    `SELECT li.id AS form_id,
            li.text AS form_text,
            word.id AS word_id,
            word.text AS word_text
     FROM lexicon_items li
     JOIN lexicon_items word ON word.id = li.parent_id
     WHERE li.lexicon_id = 1
       AND li.is_leaf = true
       AND length(normalize_hadith(li.text)) >= 3
       AND normalize_hadith($1) LIKE '%' || normalize_hadith(li.text) || '%'
     ORDER BY length(normalize_hadith(li.text)) DESC
     LIMIT 40`,
    [matnCompare]
  )

  const words: GhareebWord[] = []
  for (const row of res.rows) {
    const sources = await fetchDefinitions(row.form_id, row.word_id, row.form_text, null)
    words.push(
      buildGhareebWord(
        {
          formId: row.form_id,
          formText: row.form_text,
          wordId: row.word_id,
          wordText: row.word_text,
        },
        sources
      )
    )
  }
  return words
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id, 10)
  if (isNaN(hadithId)) {
    return NextResponse.json({ error: 'Invalid ID' }, { status: 400 })
  }

  try {
    const hadithRes = await pool.query<{ content: string }>(
      `SELECT content FROM hadith_toc WHERE main_id = $1`,
      [hadithId]
    )
    if (!hadithRes.rows[0]) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const content = hadithRes.rows[0].content
    const matnCompare = extractMatnForComparison(content)
    const { matn: matnDisplay } = splitSanadMatn(content)
    const matn = matnDisplay || matnCompare

    const tagged = await wordsFromGhareebTags(content)
    const linked = tagged.length === 0 ? await wordsFromLexiconLinks(hadithId) : []
    const scanned =
      tagged.length === 0 && linked.length === 0 && matnCompare
        ? await wordsFromMatnScan(matnCompare)
        : []

    const words = dedupeGhareebWords([...tagged, ...linked, ...scanned])

    return NextResponse.json({ words, matn })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
