import { libraryRoute, body } from '@/lib/libraryApi'
import { addHighlight, deleteHighlight, listHighlights, updateHighlight } from '@/lib/library'

export const dynamic = 'force-dynamic'

// GET ?hadith=id; POST {hadith_id, part, start_at, end_at, quote, note?, color?}; PATCH {id, note}; DELETE ?id
export const GET = libraryRoute(async (user, req) => {
  const h = Number(new URL(req.url).searchParams.get('hadith'))
  return { highlights: await listHighlights(user.id, Number.isInteger(h) && h > 0 ? h : undefined) }
})
export const POST = libraryRoute(async (user, req) => {
  const b = await body(req)
  return {
    id: await addHighlight(user.id, {
      hadith_id: Number(b.hadith_id), part: String(b.part), start_at: Number(b.start_at), end_at: Number(b.end_at),
      quote: String(b.quote ?? ''), note: b.note == null ? null : String(b.note), color: b.color == null ? undefined : String(b.color),
    }),
  }
})
export const PATCH = libraryRoute(async (user, req) => {
  const b = await body(req)
  await updateHighlight(user.id, Number(b.id), b.note == null ? null : String(b.note))
})
export const DELETE = libraryRoute(async (user, req) => { await deleteHighlight(user.id, Number(new URL(req.url).searchParams.get('id'))) })
