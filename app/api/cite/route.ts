import { NextResponse } from 'next/server'
import { citeItems, FORMATS, isFormat } from '@/lib/citation'

export const dynamic = 'force-dynamic'

// GET ?ids=5338,11631&format=bib|ris|json|csv|txt[&download=1]: citations of hadiths, for reference
// managers (lib/citation.ts). Public — the same facts the hadith pages show.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams
  const format = p.get('format') ?? 'bib'
  if (!isFormat(format)) return NextResponse.json({ error: 'format: bib, ris, json, csv or txt' }, { status: 400 })
  const ids = (p.get('ids') ?? '').split(',').map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 500)
  if (!ids.length) return NextResponse.json({ error: 'ids' }, { status: 400 })
  const items = await citeItems(ids)
  const f = FORMATS[format]
  const name = items.length === 1 ? items[0].key : `hadith-${items.length}`
  return new NextResponse(f.render(items), {
    headers: {
      'Content-Type': f.type,
      ...(p.get('download') ? { 'Content-Disposition': `attachment; filename="${name}.${f.ext}"` } : {}),
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
