import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim()
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const bookFilter = searchParams.get('book') || ''

  if (!q || q.length < 3) return NextResponse.json({ results: [], hasMore: false })

  const LIMIT = 20
  const offset = (page - 1) * LIMIT

  const conditions: string[] = [
    `to_tsvector('simple', coalesce(nb.content, '')) @@ plainto_tsquery('simple', normalize_hadith($1))`
  ]
  const params: (string | number)[] = [q, LIMIT + 1, offset]
  let pi = 4

  if (bookFilter) {
    conditions.push(`nb.book_name ILIKE $${pi}`)
    params.push(`%${bookFilter}%`)
    pi++
  }

  const where = conditions.join(' AND ')

  const { rows } = await pool.query(
    `SELECT nb.narrator_id, nb.book_name, nb.title,
            ts_headline(
              'simple',
              nb.content,
              plainto_tsquery('simple', normalize_hadith($1)),
              'MaxWords=60, MinWords=20, ShortWord=2, MaxFragments=2, FragmentDelimiter='' ... '', StartSel=''【'', StopSel=''】''
            ) as excerpt,
            n.name as narrator_name, n.abb_name,
            n.martaba_ibn_hajar, n.is_companion
     FROM narrator_biography nb
     JOIN narrators n ON n.id = nb.narrator_id
     WHERE ${where}
     ORDER BY nb.narrator_id, nb.book_name
     LIMIT $2 OFFSET $3`,
    params
  )

  const hasMore = rows.length > LIMIT
  const results = rows.slice(0, LIMIT)

  return NextResponse.json({ results, hasMore, page })
}
