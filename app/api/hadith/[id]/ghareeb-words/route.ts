import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison, splitSanadMatn } from '@/lib/hadithText'
import {
  buildGhareebSourceFromRef,
  buildGhareebWord,
  dedupeGhareebWords,
  ghareebRefContentWhere,
  GHAREEB_SOURCE_BOOK_IDS,
  parseGhareebTags,
  stripTashkeel,
  type GhareebSource,
  type GhareebWord,
  type GhareebTag,
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

async function fetchSourcesByGhareebRef(refId: number): Promise<GhareebSource[]> {
  const res = await pool.query<ContentRow>(
    `SELECT
       part_text,
       tarf,
       content,
       book_name AS source_book,
       id::bigint AS source_ref_id
     FROM hadith_service_content
     WHERE ${ghareebRefContentWhere('$1')}
       AND book_id = ANY($2::int[])
     ORDER BY
       CASE book_id
         WHEN 78 THEN 0
         WHEN 79 THEN 1
         WHEN 80 THEN 2
         WHEN 95 THEN 3
         WHEN 12 THEN 4
         WHEN 13 THEN 5
         WHEN 14 THEN 6
         ELSE 7
       END,
       id
     LIMIT 8`,
    [refId, [...GHAREEB_SOURCE_BOOK_IDS]]
  )

  const sources: GhareebSource[] = []
  const seen = new Set<number>()
  for (const row of res.rows) {
    const refKey = row.source_ref_id != null ? Number(row.source_ref_id) : 0
    if (refKey && seen.has(refKey)) continue
    const src = buildGhareebSourceFromRef(row, refId)
    if (src) {
      if (refKey) seen.add(refKey)
      sources.push(src)
    }
  }
  return sources
}

/** Optional: resolve lexicon row only for the المعجم link — not for definitions. */
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
     ORDER BY length(li.text) ASC
     LIMIT 1`,
    [word]
  )
  return res.rows[0] ?? null
}

async function wordFromGhareebTag(tag: GhareebTag): Promise<GhareebWord | null> {
  if (!tag.word) return null

  const sources = tag.refId ? await fetchSourcesByGhareebRef(tag.refId) : []
  const lex = await resolveLexiconForm(tag.word)

  let formId = lex?.form_id ?? tag.refId ?? 0
  if (!formId) {
    let h = 0
    for (const c of stripTashkeel(tag.word)) h = (h * 31 + c.charCodeAt(0)) | 0
    formId = Math.abs(h) || 1
  }

  return buildGhareebWord(
    {
      formId,
      formText: tag.word,
      wordId: lex?.word_id ?? lex?.form_id ?? 0,
      wordText: lex?.form_text ?? stripTashkeel(tag.word),
    },
    sources
  )
}

async function wordsFromGhareebTags(content: string): Promise<GhareebWord[]> {
  const tags = parseGhareebTags(content)
  const words: GhareebWord[] = []

  for (const tag of tags) {
    const word = await wordFromGhareebTag(tag)
    if (word) words.push(word)
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

    const words = dedupeGhareebWords(await wordsFromGhareebTags(content))

    return NextResponse.json(
      { words, matn },
      { headers: { 'X-Ghareeb-Sources': 'v2' } }
    )
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
