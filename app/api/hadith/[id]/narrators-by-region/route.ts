import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id, 10)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await pool.query(
    `SELECT DISTINCT ON (n.id)
            n.id, n.name, n.living_city, n.birth_city, n.journey_city, n.death_year_num
     FROM isnad_hadiths ih
     JOIN isnad_chains ic ON ic.id = ih.isnad_id
     JOIN narrators n ON n.id = ANY(ic.narrator_id_array)
     WHERE ih.hadith_id = $1
     ORDER BY n.id, n.death_year_num ASC NULLS LAST`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  return NextResponse.json({ narrators: res.rows })
}
