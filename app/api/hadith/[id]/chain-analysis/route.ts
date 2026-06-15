import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const hadithId = parseInt(id)
  if (isNaN(hadithId)) return NextResponse.json({ error: 'invalid' }, { status: 400 })

  // Get all chains for this hadith with narrator grades
  const { rows } = await pool.query(
    `SELECT ic.id AS chain_id, ic.chain_length,
            pos.ord::int AS pos,
            n.id AS narrator_id, n.name, n.abb_name,
            n.is_companion, n.martaba_ibn_hajar, n.martaba_zahabi,
            n.tabaqa, n.death_year,
            CASE
              WHEN n.is_companion THEN 'صحابي'
              WHEN n.martaba_ibn_hajar ~* 'ثقة|ثبت|حجة|عدل' THEN 'ثقة'
              WHEN n.martaba_ibn_hajar ~* 'صدوق|مقبول|لا بأس' THEN 'صدوق'
              WHEN n.martaba_ibn_hajar ~* 'ضعيف|منكر|متروك|كذاب|مجهول' THEN 'ضعيف'
              ELSE 'مجهول الحال'
            END AS reliability
     FROM isnad_hadiths iha
     JOIN isnad_chains ic ON ic.id = iha.isnad_id
     JOIN LATERAL unnest(ic.narrator_id_array) WITH ORDINALITY AS pos(nar_id, ord) ON true
     JOIN narrators n ON n.id = pos.nar_id
     WHERE iha.hadith_id = $1
     ORDER BY ic.id, pos.ord`,
    [hadithId]
  )

  // Group by chain_id
  type ChainData = {
    chain_id: number
    chain_length: number | null
    narrators: typeof rows
    has_weak: boolean
    weak_count: number
    all_authentic: boolean
  }

  const chainMap = new Map<number, ChainData>()
  for (const row of rows) {
    if (!chainMap.has(row.chain_id)) {
      chainMap.set(row.chain_id, {
        chain_id: row.chain_id,
        chain_length: row.chain_length,
        narrators: [],
        has_weak: false,
        weak_count: 0,
        all_authentic: true,
      })
    }
    const chain = chainMap.get(row.chain_id)!
    chain.narrators.push(row)
    if (row.reliability === 'ضعيف' || row.reliability === 'مجهول الحال') {
      chain.has_weak = true
      chain.weak_count++
      chain.all_authentic = false
    }
  }

  const chains = [...chainMap.values()].sort((a, b) => {
    // Sort: chains with no weak narrators first, then by chain length
    if (a.all_authentic !== b.all_authentic) return a.all_authentic ? -1 : 1
    return (a.chain_length || 99) - (b.chain_length || 99)
  })

  return NextResponse.json({ chains, total_chains: chains.length })
}
