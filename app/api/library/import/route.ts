import { libraryRoute, body } from '@/lib/libraryApi'
import { importLocal } from '@/lib/library'

export const dynamic = 'force-dynamic'

// POST {saved: number[], notes: {id: text}, tags: {id: text}}: what was saved in the browser before
// signing in, merged into the account (nothing already there is overwritten)
export const POST = libraryRoute(async (user, req) => importLocal(user.id, await body(req)))
