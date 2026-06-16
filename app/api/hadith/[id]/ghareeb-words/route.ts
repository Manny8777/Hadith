import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'
import {
  buildGhareebWord,
  cleanDefinition,
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

interface DefRow {
  definition: string | null
  source_book: string | null
  source_ref_id: number | null
}

function toSource(row: DefRow): GhareebSource {
  return {
    definition: cleanDefinition(row.definition),
    sourceBook: row.source_book,
    sourceRefId: row.source_ref_id,
  }
}

function dedupeSources(sources: GhareebSource[]): GhareebSource[] {
  const seen = new Set<string>()
  const out: GhareebSource[] = []
  for (const s of sources) {
    if (!s.definition && !s.sourceBook) continue
    const key = `${s.sourceRefId ?? ''}|${s.sourceBook ?? ''}|${s.definition ?? ''}`
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
     ORDER BY length(li.text) DESC
     LIMIT 1`,
    [word]
  )
  return res.rows[0] ?? null
}

async function fetchServiceContent(refId: number): Promise<GhareebSource | null> {
  const res = await pool.query<DefRow>(
    `SELECT
       COALESCE(part_text, tarf, LEFT(content, 1200)) AS definition,
       book_name AS source_book,
       id::bigint AS source_ref_id
     FROM hadith_service_content
     WHERE id = $1`,
    [refId]
  )
  const row = res.rows[0]
  if (!row?.definition) return null
  return toSource(row)
}

async function fetchDefinitions(
  formId: number,
  wordId: number,
  wordInMatn: string,
  tagRefId: number | null
): Promise<GhareebSource[]> {
  const sources: GhareebSource[] = []

  if (tagRefId) {
    const direct = await fetchServiceContent(tagRefId)
    if (direct) sources.push(direct)
  }

  const fromLinks = await pool.query<DefRow>(
    `SELECT
       COALESCE(hsc.part_text, hsc.tarf, LEFT(hsc.content, 1200)) AS definition,
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
    if (row.definition) sources.push(toSource(row))
  }

  if (sources.length === 0) {
    const fromNihaya = await pool.query<DefRow>(
      `SELECT
         COALESCE(hsc.part_text, hsc.tarf, LEFT(hsc.content, 1200)) AS definition,
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
      if (row.definition) sources.push(toSource(row))
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
          wordText: row.word_text,
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
    definition: string | null
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
       COALESCE(hsc.part_text, hsc.tarf, LEFT(hsc.content, 800)) AS definition,
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
    if (r.definition || r.source_book) {
      entry.sources.push(toSource(r))
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
