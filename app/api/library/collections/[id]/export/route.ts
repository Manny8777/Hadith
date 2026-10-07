import { NextResponse } from 'next/server'
import { currentUser } from '@/lib/auth'
import { getCollection } from '@/lib/library'
import { citeItems, FORMATS, isFormat } from '@/lib/citation'

export const dynamic = 'force-dynamic'

// GET ?format=bib|ris|json|csv|txt: a collection's hadiths as a file for a reference manager, in the
// collection's order, each with the reader's note and tags (lib/citation.ts)
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'سجّل الدخول أولًا' }, { status: 401 })
  const format = new URL(req.url).searchParams.get('format') ?? 'bib'
  if (!isFormat(format)) return NextResponse.json({ error: 'format: bib, ris, json, csv or txt' }, { status: 400 })
  const c = await getCollection(user.id, Number((await ctx.params).id))
  if (!c) return NextResponse.json({ error: 'لا توجد هذه المجموعة' }, { status: 404 })
  const hadiths = c.list.filter(i => i.kind === 'hadith')
  const items = await citeItems(hadiths.map(i => Number(i.ref)))
  const extra = new Map(hadiths.map(i => [Number(i.ref), i]))
  for (const it of items) { const e = extra.get(it.id); it.note = e?.note || null; it.tags = e?.tags ?? [] }
  const f = FORMATS[format]
  const name = `collection-${c.id}`
  return new NextResponse(f.render(items), {
    headers: { 'Content-Type': f.type, 'Content-Disposition': `attachment; filename="${name}.${f.ext}"`, 'Cache-Control': 'no-store' },
  })
}
