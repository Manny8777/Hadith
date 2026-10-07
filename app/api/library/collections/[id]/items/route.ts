import { libraryRoute, body, idOf, type IdCtx } from '@/lib/libraryApi'
import { addItem, isKind, LibraryError, moveItem, removeItem } from '@/lib/library'

export const dynamic = 'force-dynamic'

// POST {kind, ref, label?} adds; DELETE ?kind&ref removes; PATCH {itemId, direction: up|down} moves
export const POST = libraryRoute<IdCtx>(async (user, req, ctx) => {
  const b = await body(req)
  if (!isKind(b.kind)) throw new LibraryError('نوع غير صالح')
  await addItem(user.id, await idOf(ctx), b.kind, String(b.ref ?? ''), b.label == null ? null : String(b.label))
})
export const DELETE = libraryRoute<IdCtx>(async (user, req, ctx) => {
  const p = new URL(req.url).searchParams
  const kind = p.get('kind')
  if (!isKind(kind)) throw new LibraryError('نوع غير صالح')
  await removeItem(user.id, await idOf(ctx), kind, String(p.get('ref') ?? ''))
})
export const PATCH = libraryRoute<IdCtx>(async (user, req, ctx) => {
  const b = await body(req)
  await moveItem(user.id, await idOf(ctx), Number(b.itemId), b.direction === 'up' ? 'up' : 'down')
})
