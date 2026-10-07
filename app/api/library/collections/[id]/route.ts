import { libraryRoute, body, idOf, type IdCtx } from '@/lib/libraryApi'
import { deleteCollection, getCollection, LibraryError, updateCollection } from '@/lib/library'

export const dynamic = 'force-dynamic'

export const GET = libraryRoute<IdCtx>(async (user, _req, ctx) => {
  const c = await getCollection(user.id, await idOf(ctx))
  if (!c) throw new LibraryError('لا توجد هذه المجموعة', 404)
  return c
})
export const PATCH = libraryRoute<IdCtx>(async (user, req, ctx) => {
  const b = await body(req)
  await updateCollection(user.id, await idOf(ctx), {
    title: b.title === undefined ? undefined : String(b.title),
    description: b.description === undefined ? undefined : (b.description == null ? null : String(b.description)),
  })
})
export const DELETE = libraryRoute<IdCtx>(async (user, _req, ctx) => { await deleteCollection(user.id, await idOf(ctx)) })
