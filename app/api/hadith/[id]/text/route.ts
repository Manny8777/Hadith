import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { extractMatnForComparison } from '@/lib/hadithText'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  // Two id spaces reach this route and they are not interchangeable: TakhrijClient passes a row's
  // `main_id` (its intended key), while MatnVariants passes a hadith id. Default stays main_id so
  // the takhrij caller is unchanged; ?by=id selects the hadith row explicitly.
  const byId = new URL(req.url).searchParams.get('by') === 'id'
  const res = await pool.query(
    byId
      ? `SELECT content FROM hadith_toc WHERE id = $1`
      : `SELECT content FROM hadith_toc WHERE main_id = $1`,
    [mainId]
  )
  const raw: string | null = res.rows[0]?.content ?? null
  const text = raw ? extractMatnForComparison(raw) : null
  return NextResponse.json({ text })
}
