import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

const MAX_EXPORT_LIMIT = 200
const DEFAULT_EXPORT_LIMIT = 200
const MAX_DATABASE_INTEGER = 2_147_483_647

function parseIntegerParam(value: string | null): number | null {
  if (value === null || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function parseTopicId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= MAX_DATABASE_INTEGER
    ? parsed
    : null
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const itemId = parseTopicId(id)
  if (itemId === null) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 })
  }

  const searchParams = new URL(req.url).searchParams
  const limitParam = searchParams.get('limit')
  const offsetParam = searchParams.get('offset')
  const requestedLimit = limitParam === null
    ? DEFAULT_EXPORT_LIMIT
    : parseIntegerParam(limitParam)
  const requestedOffset = offsetParam === null ? 0 : parseIntegerParam(offsetParam)
  if (requestedLimit === null || requestedLimit < 1 || requestedOffset === null) {
    return NextResponse.json({ error: 'invalid pagination' }, { status: 400 })
  }

  const limit = Math.min(requestedLimit, MAX_EXPORT_LIMIT)
  const offset = requestedOffset

  try {
    const itemRes = await pool.query<{ id: number; title: string }>(
      `SELECT id, title FROM subject_items WHERE id = $1`,
      [itemId]
    )
    if (!itemRes.rows[0]) {
      return NextResponse.json({ error: 'not found' }, { status: 404 })
    }

    const [hadithRes, countRes] = await Promise.all([
      pool.query(
        `WITH distinct_links AS (
           SELECT DISTINCT subject_id, paragraph_main_id
           FROM hadith_subjects
           WHERE subject_id = $1
         )
         SELECT h.main_id, h.book_id, b.title AS book_title,
                b.takhrij_author, b.takhrij_death,
                h.tarf, h.part_num, h.page_num,
                h.section_text, h.chapter_text,
                h.tarqeem_harf, h.tarqeem_matboa1,
                jg.grade_hint
         FROM distinct_links hs
         JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
         JOIN books b ON b.id = h.book_id
         LEFT JOIN LATERAL (
           SELECT CASE
             WHEN say_text ~* 'صحيح' THEN 'صحيح'
             WHEN say_text ~* 'إسناده حسن|حديث حسن|سنده حسن' AND say_text !~* 'صحيح' THEN 'حسن'
             WHEN say_text ~* 'ضعيف|منكر|متروك|موضوع' THEN 'ضعيف'
             ELSE NULL END as grade_hint
           FROM hadith_judgments j2
           WHERE j2.hadith_id = h.main_id
             AND j2.say_text ~* 'صحيح|إسناده حسن|حديث حسن|سنده حسن|ضعيف|منكر|متروك'
           ORDER BY CASE
             WHEN j2.say_text ~* 'صحيح' THEN 1
             WHEN j2.say_text ~* 'حسن' THEN 2
             ELSE 3 END
           LIMIT 1
         ) jg ON true
         ORDER BY h.book_id ASC, h.main_id ASC
         LIMIT $2 OFFSET $3`,
        [itemId, limit, offset]
      ),
      pool.query<{
        distinct_linked_associations: number
        exportable_resolved_rows: number
        unresolved_associations: number
      }>(
        `WITH distinct_links AS (
           SELECT DISTINCT subject_id, paragraph_main_id
           FROM hadith_subjects
           WHERE subject_id = $1
         )
         SELECT
           COUNT(*)::int AS distinct_linked_associations,
           COUNT(b.id)::int AS exportable_resolved_rows,
           (COUNT(*) - COUNT(b.id))::int AS unresolved_associations
         FROM distinct_links hs
         LEFT JOIN hadith_toc h ON h.main_id = hs.paragraph_main_id
         LEFT JOIN books b ON b.id = h.book_id`,
        [itemId]
      ),
    ])

    const counts = countRes.rows[0]
    if (!counts) throw new Error('Topic export count query returned no row')

    const distinctLinkedAssociations = Number(counts.distinct_linked_associations)
    const exportableResolvedRows = Number(counts.exportable_resolved_rows)
    const unresolvedAssociations = Number(counts.unresolved_associations)
    const returnedRows = hadithRes.rows.length
    const expectedReturnedRows = Math.max(
      0,
      Math.min(limit, exportableResolvedRows - Math.min(offset, exportableResolvedRows)),
    )

    if (
      !Number.isSafeInteger(distinctLinkedAssociations) ||
      !Number.isSafeInteger(exportableResolvedRows) ||
      !Number.isSafeInteger(unresolvedAssociations) ||
      distinctLinkedAssociations < 0 ||
      exportableResolvedRows < 0 ||
      unresolvedAssociations < 0 ||
      exportableResolvedRows > distinctLinkedAssociations ||
      unresolvedAssociations !== distinctLinkedAssociations - exportableResolvedRows ||
      returnedRows !== expectedReturnedRows
    ) {
      throw new Error('Topic export count query returned inconsistent counts')
    }

    const hasMore = offset + returnedRows < exportableResolvedRows

    return NextResponse.json({
      item: itemRes.rows[0],
      hadiths: hadithRes.rows,
      // Preserve the legacy field: it represented the number of rows in this response.
      total: returnedRows,
      distinct_linked_associations: distinctLinkedAssociations,
      exportable_resolved_rows: exportableResolvedRows,
      returned_rows: returnedRows,
      unresolved_associations: unresolvedAssociations,
      truncated: hasMore,
      pagination: {
        limit,
        offset,
        has_more: hasMore,
        next_offset: hasMore ? offset + returnedRows : null,
      },
    })
  } catch {
    return NextResponse.json(
      { error: 'unable to export topic citations' },
      { status: 500 }
    )
  }
}
