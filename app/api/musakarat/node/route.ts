import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

// GET /api/musakarat/node?node_id=4
// Returns the musakarat leaf-node details + the hadiths that compose the issue.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const nodeId = parseInt(searchParams.get('node_id') || '', 10)
  if (isNaN(nodeId)) return NextResponse.json({ error: 'Invalid node_id' }, { status: 400 })

  try {
    // Node details
    const nodeRes = await pool.query<{ id: number; text: string; parent_id: number; is_leaf: boolean; node_id: number }>(
      `SELECT id, text, parent_id, is_leaf, node_id
       FROM hadith_controversial_tree WHERE id = $1`,
      [nodeId]
    )
    const node = nodeRes.rows[0]
    if (!node) return NextResponse.json({ error: 'Node not found' }, { status: 404 })

    // Hadiths composing the issue: tree -> hcd -> hsl -> hadith_toc (tarf) + books
    const hadithsRes = await pool.query<{
      hadith_id: number
      tarf: string | null
      book_title: string | null
    }>(
      `SELECT DISTINCT hsl.hadith_id,
              (SELECT tarf FROM hadith_toc ht
               WHERE ht.main_id = hsl.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true LIMIT 1) AS tarf,
              (SELECT b.title FROM books b
               JOIN hadith_toc ht ON ht.book_id = b.id
               WHERE ht.main_id = hsl.hadith_id AND ht.is_leaf = true AND ht.is_paragraph = true LIMIT 1) AS book_title
       FROM hadith_controversial_tree ct
       JOIN hadith_controversial_descriptions hcd ON hcd.node_id = ct.id
       JOIN hadith_service_links hsl ON hsl.service_content_id = hcd.service_main_id
       WHERE ct.id = $1
       ORDER BY hsl.hadith_id`,
      [nodeId]
    )

    return NextResponse.json({
      node: { id: node.id, text: node.text, parent_id: node.parent_id, is_leaf: node.is_leaf },
      hadiths: hadithsRes.rows,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
