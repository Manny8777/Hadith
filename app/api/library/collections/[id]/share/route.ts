import { libraryRoute, body, idOf, type IdCtx } from '@/lib/libraryApi'
import { setShared } from '@/lib/library'

export const dynamic = 'force-dynamic'

// POST {on: true|false}: a read-only link to the collection (/library/shared/<token>), or none
export const POST = libraryRoute<IdCtx>(async (user, req, ctx) => {
  const b = await body(req)
  return { share_token: await setShared(user.id, await idOf(ctx), b.on === true) }
})
