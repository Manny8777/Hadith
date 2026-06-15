import { NextResponse } from 'next/server'
import pool from '@/lib/db'

function extractMatn(raw: string): string {
  // Pull text only from <متن> elements (hadith body, after isnad)
  const matnRe = /<متن[^>]*>([\s\S]*?)<\/متن>/g
  const parts: string[] = []
  let m: RegExpExecArray | null
  while ((m = matnRe.exec(raw)) !== null) parts.push(m[1])
  const src = parts.length > 0 ? parts.join(' ') : raw

  return src
    .replace(/<[^>]+>/g, ' ')                                    // strip XML tags
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, c: string) => String.fromCharCode(parseInt(c, 10)))
    .replace(/[0-9٠-٩]+/g, ' ')                                  // remove numerals
    .replace(/[-–—]/g, ' ')                                       // dashes → space
    .replace(/[،؛؟,.;:!?()\[\]{}"'«»“”‘’]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const mainId = parseInt(id)
  if (isNaN(mainId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 })

  const res = await pool.query(
    `SELECT content FROM hadith_toc WHERE main_id = $1`,
    [mainId]
  )
  const raw: string | null = res.rows[0]?.content ?? null
  const text = raw ? extractMatn(raw) : null
  return NextResponse.json({ text })
}
