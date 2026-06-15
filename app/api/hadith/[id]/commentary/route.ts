import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const url = new URL(req.url)
  const typeId = parseInt(url.searchParams.get('type') || '')

  const groupsRes = await pool.query(
    `SELECT hsl.type_id,
            coalesce(hst.name, 'غير محدد') AS type_name,
            COUNT(*) AS count
     FROM hadith_service_links hsl
     LEFT JOIN hadith_service_types hst ON hst.id = hsl.type_id
     WHERE hsl.hadith_id = $1
     GROUP BY hsl.type_id, hst.name
     ORDER BY hsl.type_id`,
    [hadithId]
  ).catch(() => ({ rows: [] }))

  const typeGroups = groupsRes.rows
  const selectedTypeId = !isNaN(typeId) ? typeId : (typeGroups[0]?.type_id ?? null)

  let contentRows: unknown[] = []
  if (selectedTypeId) {
    const res = await pool.query(
      `SELECT hsc.id, hsc.book_name,
              hsc.section_text, hsc.part_num, hsc.page_num,
              hsc.tarf, hsc.content
       FROM hadith_service_links hsl
       JOIN hadith_service_content hsc ON hsc.id = hsl.service_content_id
       WHERE hsl.hadith_id = $1 AND hsl.type_id = $2
       ORDER BY hsc.book_id, hsc.id
       LIMIT 100`,
      [hadithId, selectedTypeId]
    ).catch(() => ({ rows: [] }))
    contentRows = res.rows
  }

  return NextResponse.json({ typeGroups, contentRows, selectedTypeId })
}
